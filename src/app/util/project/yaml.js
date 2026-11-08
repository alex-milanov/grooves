import { dump, load } from 'js-yaml';
import { assertProjectDoc } from './document';

export const dumpProjectYaml = (doc) =>
  dump(doc, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
  });

export const parseProjectYaml = (text) => {
  const doc = load(text);
  return assertProjectDoc(doc);
};
