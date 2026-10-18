/* Fills the site details into the legal pages and flags anything not filled in yet. */
(function () {
  var site = window.TEAM_SITE || {};
  var missing = false;
  document.querySelectorAll("[data-site]").forEach(function (el) {
    var v = site[el.getAttribute("data-site")] || "";
    if (!v || /^FILL IN/.test(v)) { missing = true; el.classList.add("todo"); }
    el.textContent = v || "[not filled in]";
    if (el.getAttribute("data-site") === "email" && v && !/^FILL IN/.test(v)) { el.innerHTML = ""; var a = document.createElement("a"); a.href = "mailto:" + v; a.textContent = v; el.appendChild(a); }
  });
  if (missing) { var b = document.getElementById("draft"); if (b) b.hidden = false; }
})();
