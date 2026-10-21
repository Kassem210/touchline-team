/* Anonymous visit counter. Adds 1 to a daily total in Firestore (metrics/<date>).
   No cookies, no identifiers, no personal data. A session flag stops a reload in the same tab counting twice. */
(function () {
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  window.tlCount = function (field, oncePerSession) {
    try {
      var cfg = window.TEAM_FIREBASE_CONFIG || {}, emu = window.TEAM_EMULATOR;
      if (!cfg.projectId || /PASTE/.test(cfg.apiKey || "")) return;
      if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
      if (oncePerSession) { var k = "tl.count." + field + "." + today(); if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); }
      var base = emu ? "http://" + emu.host + ":" + emu.fsPort : "https://firestore.googleapis.com";
      var db = "projects/" + cfg.projectId + "/databases/(default)/documents";
      var body = { writes: [{ transform: { document: db + "/metrics/" + today(), fieldTransforms: [{ fieldPath: field, increment: { integerValue: "1" } }] } }] };
      fetch(base + "/v1/" + db + ":commit?key=" + encodeURIComponent(cfg.apiKey), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(function () {});
    } catch (e) { /* counting must never break the page */ }
  };
})();
