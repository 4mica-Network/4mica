(() => {
  var preference = "dark";
  try {
    preference = localStorage.getItem("4mica.appTheme") || "dark";
  } catch {}
  var dark =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : preference !== "light";
  var root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
})();
