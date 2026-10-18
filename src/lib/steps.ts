export type LayerKey = 'grid' | 'blobs' | 'contours' | 'details' | 'tone0' | 'tone1' | 'tone2'

export interface StepDef {
  layer: LayerKey
  title: string
  /** What to do, in plain words. */
  instruction: string
  /** A common beginner mistake for this step. */
  watchOut: string
}

export const STEPS: StepDef[] = [
  {
    layer: 'grid',
    title: 'Observe and set up the grid',
    instruction:
      'Lightly draw the grid on your paper. Then study the photo one square at a time: note where big shapes and edges cross the grid lines. The grid is your map for every step that follows.',
    watchOut: 'Press very lightly. Grid lines should be easy to erase later.',
  },
  {
    layer: 'blobs',
    title: 'Block in the big shapes',
    instruction:
      'Draw only the large, simple shapes where light, medium and dark masses meet. Straight lines and gentle curves are fine. Ignore every detail.',
    watchOut: 'Resist drawing small features yet. Wrong proportions are far easier to fix now than later.',
  },
  {
    layer: 'contours',
    title: 'Refine the main contours',
    instruction:
      'Turn the rough shapes into the real outlines of the main objects. Check angles and distances against the grid squares as you go.',
    watchOut: 'Keep lines light and sketchy. Several loose lines beat one hard, wrong line.',
  },
  {
    layer: 'details',
    title: 'Add the smaller details',
    instruction:
      'Add the smaller edges and features that sit inside the shapes. Work from larger to smaller, and stop when it reads clearly.',
    watchOut: 'Not every line in the photo needs to be drawn. Leave some out.',
  },
  {
    layer: 'tone0',
    title: 'Shade the darkest areas',
    instruction:
      'Lightly fill the darkest shapes with even strokes in one direction. These deep shadows give the drawing its structure.',
    watchOut: 'Build darkness gradually. Going too dark too early leaves no room for contrast.',
  },
  {
    layer: 'tone1',
    title: 'Add the mid-tones',
    instruction:
      'Fill the medium-dark areas with a lighter touch than the darkest shadows. Let the new tone overlap the edges of the shade you already put down.',
    watchOut: 'Keep each tone clearly different from the one before it.',
  },
  {
    layer: 'tone2',
    title: 'Finish with the light tones',
    instruction:
      'Add a very light tone over the remaining shaded areas. Leave the bare paper for the brightest highlights, then step back and compare with the photo.',
    watchOut: 'Do not shade the highlights. The white of the paper is your lightest value.',
  },
]
