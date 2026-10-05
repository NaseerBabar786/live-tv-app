// Small helpers shared by the main process (require) and the window (plain <script>).
// Pure functions only, so they run in plain Node tests (test/util.test.js).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MCUtil = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  /** WhatsApp Web puts the unread chat count in the tab title: "(3) WhatsApp". */
  function unreadFromTitle(title) {
    const m = /^\((\d+)\)/.exec(String(title || '').trim());
    return m ? parseInt(m[1], 10) : 0;
  }

  /** "22:30" -> 1350 minutes after midnight, or null when not a time. */
  function minutesOf(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
    if (!m) return null;
    const h = +m[1], min = +m[2];
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  /**
   * Whether [date] falls in the quiet hours from..to. The range may cross midnight
   * ("22:00" to "07:00"). Equal start and end means quiet all day.
   */
  function inQuietHours(quiet, date) {
    if (!quiet || !quiet.on) return false;
    const from = minutesOf(quiet.from), to = minutesOf(quiet.to);
    if (from == null || to == null) return false;
    const now = date.getHours() * 60 + date.getMinutes();
    if (from === to) return true;
    return from < to ? now >= from && now < to : now >= from || now < to;
  }

  /** Compares dotted versions number by number, so "1.10.0" is newer than "1.9.9". */
  function compareVersions(a, b) {
    const x = String(a).split('.').map(n => parseInt(n, 10) || 0);
    const y = String(b).split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }

  /** "Multi Chat for PC 1.2.3" -> "1.2.3". */
  function versionFromTitle(title) {
    const m = /(\d+\.\d+(?:\.\d+)*)\s*$/.exec(String(title || ''));
    return m ? m[1] : null;
  }

  /** Initials for an account with no photo: "Bulk Bazaar" -> "BB", "personal" -> "P". */
  function initials(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  }

  return { unreadFromTitle, minutesOf, inQuietHours, compareVersions, versionFromTitle, initials };
});
