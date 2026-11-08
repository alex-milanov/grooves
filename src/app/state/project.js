import { applyProjectDocument } from '../util/project/document';

/** Apply a parsed grooves-project document to state. */
export const loadProject = (doc) => applyProjectDocument(doc);

export { applyProjectDocument };
