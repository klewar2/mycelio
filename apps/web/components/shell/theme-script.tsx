/**
 * Applique le thème avant le premier rendu, pour éviter le flash blanc — particulièrement
 * pénible ici, l'application étant conçue pour être consultée de nuit.
 *
 * Le sombre est le défaut : ce n'est pas une pose, c'est l'usage réel (6 h du matin, dans une
 * voiture, avant de partir). Le choix explicite de l'utilisateur prime, puis la préférence
 * système, puis le sombre.
 */
const script = `
(function () {
  try {
    var stored = localStorage.getItem('mycelio-theme');
    var theme = stored || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.classList.toggle('dark', theme !== 'light');
    document.documentElement.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
