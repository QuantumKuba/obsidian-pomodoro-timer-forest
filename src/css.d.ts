// styles.css is imported as text (esbuild loader) so exports can embed the scene CSS
declare module '*.css' {
    const content: string
    export default content
}
