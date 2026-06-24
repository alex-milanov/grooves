import { obj } from 'iblokz-data';

const keys = Object.keys;

const arrify = (o) =>
  o instanceof Object
    ? !(o instanceof Array) &&
      keys(o).filter((k) => k.match(/^-?[0-9.]+$/)).length === keys(o).length
      ? keys(o).map((k) => arrify(o[k]))
      : keys(o).reduce((o2, k) => obj.patch(o2, k, arrify(o[k])), {})
    : o;

export const toData = (form) =>
  arrify(
    Array.from(form.elements)
      .filter((el) => el.name !== undefined)
      .reduce(
        (o, el) =>
          obj.patch(
            o,
            el.name.split('.'),
            el.type && el.type === 'number' ? Number(el.value) : el.value,
          ),
        {},
      ),
  );

export const clear = (form) => Array.from(form.elements).forEach((el) => (el.value = null));
