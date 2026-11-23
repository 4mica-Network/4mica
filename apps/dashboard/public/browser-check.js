(() => {
  var supported =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    typeof CSS.registerProperty === "function" &&
    CSS.supports("color", "color-mix(in oklab, red, blue)") &&
    CSS.supports("selector(:has(a))") &&
    CSS.supports("height", "1dvh") &&
    "inert" in HTMLElement.prototype &&
    typeof Array.prototype.at === "function" &&
    typeof structuredClone === "function";

  if (supported) {
    return;
  }

  var root = document.documentElement;
  root.setAttribute("data-unsupported", "");

  document.addEventListener("DOMContentLoaded", () => {
    var mount = document.getElementById("root");
    if (!mount) {
      return;
    }
    mount.innerHTML =
      '<main style="max-width:28rem;margin:15vh auto;padding:0 1.5rem;font-family:system-ui,sans-serif;line-height:1.5">' +
      '<h1 style="font-size:1.25rem">Your browser is not supported</h1>' +
      "<p>The 4Mica dashboard needs a recent version of Chrome, Edge, Firefox or Safari. Update your browser, then reload this page.</p>" +
      "</main>";
  });
})();
