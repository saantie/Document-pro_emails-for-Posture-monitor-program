// จัดการสมาชิกโปร — 8Hrs Posture Monitor
// หน้าเว็บ static ล้วนๆ (ไม่มี build step) เชื่อม Firestore ตรงๆ ผ่าน Firebase JS SDK
// ความปลอดภัยทั้งหมดอยู่ที่ Firestore Security Rules (ดู firestore.rules.proposed ในโปรเจกต์หลัก)
// ไม่ใช่ที่การซ่อนโค้ดหน้านี้ — apiKey ด้านล่างไม่ใช่ความลับ (ออกแบบมาให้ฝังในโค้ด client ได้ตามปกติ)

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore, collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp, Timestamp,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

// ต้องตรงกับ firebase_config.json ของแอป (Project settings > General > Your apps ใน Firebase Console)
const firebaseConfig = {
  apiKey: "AIzaSyCs-h3Z3uNANgO-PAamoCCi3jKvnGEygYg",
  authDomain: "posture-monitor-program.firebaseapp.com",
  projectId: "posture-monitor-program",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const PROMPTPAY_MONTHLY_BAHT = 39;
const PROMPTPAY_YEARLY_BAHT = 399;
const CONTACT_LINE_OA = "@341jvvzy";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function formatThaiDate(date) {
  return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`;
}

function friendlyAuthError(err) {
  // ไม่โชว์ error ดิบจาก Firebase ให้ผู้ใช้เห็น (เช่น auth/invalid-credential) — แปลเป็นไทยที่เข้าใจง่าย
  const code = err && err.code ? err.code : "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  }
  if (code.includes("too-many-requests")) {
    return "ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่";
  }
  if (code.includes("network-request-failed")) {
    return "ต่ออินเทอร์เน็ตไม่ได้ กรุณาลองใหม่";
  }
  return "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่";
}

// ---------- หน้าจอ ----------
const loginScreen = document.getElementById("login-screen");
const dashboardScreen = document.getElementById("dashboard-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const whoamiEl = document.getElementById("whoami");
const loadErrorEl = document.getElementById("load-error");

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.hidden = true;
    dashboardScreen.hidden = false;
    whoamiEl.textContent = `เข้าสู่ระบบเป็น ${user.email}`;
    loadCustomers();
  } else {
    loginScreen.hidden = false;
    dashboardScreen.hidden = true;
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginError.textContent = friendlyAuthError(err);
    loginError.hidden = false;
  }
});

document.getElementById("btn-logout").addEventListener("click", () => signOut(auth));
document.getElementById("btn-refresh").addEventListener("click", loadCustomers);

// ---------- โหลด/แสดงรายชื่อลูกค้า ----------
const tbody = document.getElementById("customers-tbody");

async function loadCustomers() {
  loadErrorEl.hidden = true;
  tbody.innerHTML = `<tr><td colspan="6" class="muted center">กำลังโหลด...</td></tr>`;
  try {
    const snap = await getDocs(collection(db, "pro_emails"));
    const rows = snap.docs.map((d) => {
      const data = d.data();
      const expiresAt = data.expires_at && typeof data.expires_at.toDate === "function"
        ? data.expires_at.toDate() : null;
      return { email: d.id, ...data, expiresAt };
    });
    // ไม่มีวันหมดอายุ (ข้อมูลเก่า/กรอกผิด) ไว้ท้ายสุด ที่เหลือเรียงใกล้หมดอายุสุดขึ้นก่อน
    rows.sort((a, b) => {
      if (!a.expiresAt && !b.expiresAt) return a.email.localeCompare(b.email);
      if (!a.expiresAt) return 1;
      if (!b.expiresAt) return -1;
      return a.expiresAt - b.expiresAt;
    });
    renderTable(rows);
  } catch (err) {
    console.error(err);
    tbody.innerHTML = "";
    loadErrorEl.hidden = false;
    if (err && err.code === "permission-denied") {
      loadErrorEl.textContent =
        "ไม่มีสิทธิ์เข้าถึงข้อมูล — บัญชีนี้ไม่ได้ตั้งเป็นผู้ดูแลใน Firestore Rules " +
        "(เช็ค isAdmin() ใน firestore.rules ว่าตรงกับอีเมลนี้หรือไม่)";
    } else {
      loadErrorEl.textContent = "โหลดข้อมูลไม่สำเร็จ กรุณาลองกด รีเฟรช อีกครั้ง";
    }
  }
}

function daysRemaining(expiresAt) {
  if (!expiresAt) return null;
  const ms = expiresAt.getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function renderTable(rows) {
  let expiredCount = 0, warnCount = 0, okCount = 0;
  tbody.innerHTML = "";

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted center">ยังไม่มีลูกค้าโปร</td></tr>`;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");
    const days = daysRemaining(row.expiresAt);

    let rowClass = "";
    let daysLabel = "ไม่มีวันหมดอายุ (แก้ไขข้อมูลนี้)";
    if (days === null) {
      rowClass = "row-broken";
    } else if (days <= 0) {
      // <= ไม่ใช่ < : Math.ceil() ของเศษส่วนลบระหว่าง -1 ถึง 0 ให้ -0 ซึ่ง (-0 < 0) เป็น false ใน JS
      // ถ้าใช้ < เฉยๆ คนที่หมดอายุมาไม่ถึง 24 ชม. จะหลุดไปอยู่กลุ่ม "ยังไม่หมดอายุ" โดยไม่ตั้งใจ
      rowClass = "row-expired";
      daysLabel = `หมดอายุแล้ว ${Math.abs(days)} วันก่อน`;
      expiredCount++;
    } else if (days <= 7) {
      rowClass = "row-warn";
      daysLabel = `เหลืออีก ${days} วัน`;
      warnCount++;
    } else {
      daysLabel = `เหลืออีก ${days} วัน`;
      okCount++;
    }
    tr.className = rowClass;

    const expiresLabel = row.expiresAt ? formatThaiDate(row.expiresAt) : "—";
    const planLabel = { monthly: "รายเดือน", yearly: "รายปี", manual: "อื่นๆ" }[row.plan] || (row.plan || "—");

    tr.innerHTML = `
      <td>${escapeHtml(row.email)}</td>
      <td>${escapeHtml(planLabel)}</td>
      <td>${escapeHtml(row.status || "—")}</td>
      <td>${escapeHtml(expiresLabel)}</td>
      <td>${escapeHtml(daysLabel)}</td>
      <td class="row-actions">
        <button class="btn btn-ghost btn-small" data-action="edit">แก้ไข</button>
        <button class="btn btn-ghost btn-small" data-action="notify" ${row.expiresAt ? "" : "disabled"}>แจ้งเตือน</button>
        <button class="btn btn-ghost btn-small btn-danger-text" data-action="delete">ลบ</button>
      </td>
    `;
    tr.querySelector('[data-action="edit"]').addEventListener("click", () => openModal(row));
    tr.querySelector('[data-action="notify"]').addEventListener("click", () => notifyCustomer(row, days));
    tr.querySelector('[data-action="delete"]').addEventListener("click", () => deleteCustomer(row.email));
    tbody.appendChild(tr);
  }

  document.getElementById("count-expired").textContent = expiredCount;
  document.getElementById("count-warn").textContent = warnCount;
  document.getElementById("count-ok").textContent = okCount;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// ---------- เพิ่ม / แก้ไขลูกค้า ----------
const modal = document.getElementById("edit-modal");
const modalTitle = document.getElementById("modal-title");
const editForm = document.getElementById("edit-form");
const modalError = document.getElementById("modal-error");
const fieldEmail = document.getElementById("field-email");
const fieldPlan = document.getElementById("field-plan");
const fieldSource = document.getElementById("field-source");
const fieldStatus = document.getElementById("field-status");
const fieldExpires = document.getElementById("field-expires");

let editingOriginalEmail = null; // ไม่ null = กำลังแก้ไขของเดิม (ล็อกช่องอีเมลไว้ กันสร้าง document ซ้ำโดยไม่ตั้งใจ)

function openModal(existing) {
  modalError.hidden = true;
  editForm.reset();
  if (existing) {
    editingOriginalEmail = existing.email;
    modalTitle.textContent = `แก้ไข — ${existing.email}`;
    fieldEmail.value = existing.email;
    fieldEmail.disabled = true;
    fieldPlan.value = existing.plan || "manual";
    fieldSource.value = existing.source || "manual";
    fieldStatus.value = existing.status || "active";
    if (existing.expiresAt) {
      fieldExpires.value = toDateInputValue(existing.expiresAt);
    }
  } else {
    editingOriginalEmail = null;
    modalTitle.textContent = "เพิ่มลูกค้าใหม่";
    fieldEmail.disabled = false;
    fieldStatus.value = "active";
  }
  modal.hidden = false;
  (existing ? fieldExpires : fieldEmail).focus();
}

function closeModal() {
  modal.hidden = true;
}

function toDateInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

document.getElementById("btn-add").addEventListener("click", () => openModal(null));
document.getElementById("btn-cancel-modal").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

document.querySelectorAll(".quick-dates [data-days]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const d = new Date();
    d.setDate(d.getDate() + Number(btn.dataset.days));
    fieldExpires.value = toDateInputValue(d);
  });
});

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  modalError.hidden = true;
  const email = (editingOriginalEmail || fieldEmail.value).trim().toLowerCase();
  const expiresDateStr = fieldExpires.value;
  if (!email || !expiresDateStr) {
    modalError.textContent = "กรุณากรอกอีเมลและวันหมดอายุให้ครบ";
    modalError.hidden = false;
    return;
  }
  // สิ้นสุดวันที่เลือก (23:59:59 ตามเวลาเครื่องผู้ดูแล) ให้ลูกค้าใช้ได้เต็มวันที่เลือกไว้
  const expiresAt = new Date(`${expiresDateStr}T23:59:59`);

  const submitBtn = editForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await setDoc(doc(db, "pro_emails", email), {
      expires_at: Timestamp.fromDate(expiresAt),
      plan: fieldPlan.value,
      source: fieldSource.value,
      status: fieldStatus.value,
      updated_at: serverTimestamp(),
    }, { merge: true });
    closeModal();
    await loadCustomers();
  } catch (err) {
    console.error(err);
    modalError.textContent = err && err.code === "permission-denied"
      ? "ไม่มีสิทธิ์บันทึกข้อมูล — เช็ค Firestore Rules ว่าตั้งอีเมลผู้ดูแลถูกต้องหรือไม่"
      : "บันทึกไม่สำเร็จ กรุณาลองใหม่";
    modalError.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

async function deleteCustomer(email) {
  if (!confirm(`ลบสิทธิ์โปรของ ${email} ใช่ไหม? (เพิกถอนทันที กู้คืนไม่ได้ ต้องเพิ่มใหม่เอง)`)) return;
  try {
    await deleteDoc(doc(db, "pro_emails", email));
    await loadCustomers();
  } catch (err) {
    console.error(err);
    alert("ลบไม่สำเร็จ กรุณาลองใหม่");
  }
}

// ---------- แจ้งเตือนลูกค้า (mailto — ร่างให้ กดส่งเอง) ----------
function notifyCustomer(row, days) {
  const expiresLabel = row.expiresAt ? formatThaiDate(row.expiresAt) : "";
  const isExpired = days !== null && days <= 0;  // <= ไม่ใช่ < : ดู comment เดียวกันใน renderTable
  const subject = isExpired
    ? "แจ้งเตือน: สิทธิ์ 8Hrs Pro ของคุณหมดอายุแล้ว"
    : "แจ้งเตือน: สิทธิ์ 8Hrs Pro ของคุณใกล้หมดอายุ";

  const bodyLines = [
    "สวัสดีครับ/ค่ะ",
    "",
    isExpired
      ? `สิทธิ์สมาชิก 8Hrs Pro ของอีเมล ${row.email} หมดอายุไปเมื่อวันที่ ${expiresLabel} แล้ว`
      : `สิทธิ์สมาชิก 8Hrs Pro ของอีเมล ${row.email} จะหมดอายุในวันที่ ${expiresLabel} (อีก ${days} วัน)`,
    "",
    "ต่ออายุได้ทางช่องทางใดช่องทางหนึ่งด้านล่าง แล้วแจ้งอีเมลนี้กลับมาเพื่อให้เปิดสิทธิ์ต่อให้ครับ/ค่ะ:",
    "",
    `- พร้อมเพย์: ${PROMPTPAY_MONTHLY_BAHT} บาท/เดือน หรือ ${PROMPTPAY_YEARLY_BAHT} บาท/ปี (สแกน QR ในหน้า \"ใช้งานแบบบัญชีโปร\" ในโปรแกรม)`,
    "- ต่างประเทศ: PayPal.Me — https://paypal.me/saantie/10USD (รายปี $10)",
    "",
    `แจ้งกลับได้ทาง LINE ${CONTACT_LINE_OA} หรือตอบอีเมลฉบับนี้`,
    "",
    "ขอบคุณที่ใช้บริการครับ/ค่ะ",
  ];

  const url = `mailto:${encodeURIComponent(row.email)}` +
    `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join("\n"))}`;
  window.location.href = url;
}
