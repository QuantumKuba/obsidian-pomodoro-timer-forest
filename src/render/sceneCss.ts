import stylesheet from '../../styles.css'

const START = '/* pf-scene:start'
const END = '/* pf-scene:end'

/**
 * The scene rules and keyframes, sliced out of styles.css. The plugin gets them
 * from Obsidian loading styles.css; HTML exports embed this same text, so the
 * two can never drift apart.
 */
export const SCENE_CSS: string = (() => {
    const from = stylesheet.indexOf(START)
    const to = stylesheet.indexOf(END)
    return from >= 0 && to > from ? stylesheet.slice(from, to) : stylesheet
})()
