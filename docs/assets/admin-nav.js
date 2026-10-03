// The owner's Stats and Users links show in the top menu once they have signed in on the Admin page.
(() => {
  let admin = false;
  try { admin = localStorage.getItem("lt_admin") === "1"; } catch {}
  const nav = document.querySelector("header nav");
  const link = nav?.querySelector(".admin-link");
  if (!admin || !link) return;
  for (const [href, text] of [["stats", "Stats"], ["users", "Users"]]) {
    if (nav.querySelector(`a[href="${href}"]`)) continue;
    const a = document.createElement("a");
    a.href = href; a.textContent = text; a.className = "admin-extra";
    nav.insertBefore(a, link);
  }
})();
