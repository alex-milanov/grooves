import { a, span, ul, li, i } from 'iblokz-snabbdom-helpers';

/**
 * Hover dropdown (thriftify-style): handle + ul > li.
 */
export default (className, { handle, handleClick, items = [], toLeft = false, flags = false }) => {
  const mods = ['.dropdown', className];
  if (toLeft) mods.push('.to-left');
  if (flags) mods.push('.flags');

  const handleNode = flags
    ? span('.flag-handle', handle)
    : span(
        '.handle',
        {
          on: handleClick
            ? {
                click: (ev) => {
                  ev.preventDefault();
                  handleClick();
                },
              }
            : {},
        },
        handle,
      );

  const renderItem = (item) => {
    if (item.content) return item.content;
    return span(item.label);
  };

  return a(mods.filter(Boolean).join(''), [
    handleNode,
    items.length
      ? ul(
          items.map((item) =>
            li(
              {
                class: {
                  active: !!item.active,
                  disabled: !!item.disabled,
                },
                on:
                  item.disabled || !item.onSelect
                    ? {}
                    : {
                        click: (ev) => {
                          ev.preventDefault();
                          item.onSelect();
                        },
                      },
              },
              renderItem(item),
            ),
          ),
        )
      : null,
  ]);
};

export const caret = () => i('.fa.fa-caret-down');
