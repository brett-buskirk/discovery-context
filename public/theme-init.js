// Applies the saved theme before the page paints, so a chosen theme never flashes the default first.
// It's a separate file, not an inline script, because the Content-Security-Policy blocks inline scripts.
// Keep THEMES in step with src/ui/theme.ts (test/themes.test.ts checks).
(function () {
  var KEY = "discovery-context-v1-theme";
  var THEMES = ["light", "dark", "sepia", "contrast"];
  try {
    var saved = localStorage.getItem(KEY);
    if (saved && THEMES.indexOf(saved) !== -1) document.documentElement.setAttribute("data-theme", saved);
  } catch (e) {
    // Storage blocked (private mode, strict settings): fall back to Auto.
  }
})();
