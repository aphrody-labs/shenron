// Slot `@modal` inactif (pas d'interception en cours) → rien. Requis par Next
// pour que le rendu pleine page de `/wiki/movies/[slug]` et de `/wiki/movies` ne
// 404 pas sur le slot parallèle.
export default function Default() {
  return null;
}
