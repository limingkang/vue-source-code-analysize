export function patchDOMProp(
  el: any,
  key: string,
  value: any,
  //传递以下参数的唯一原因是潜在的innerHTML/textContent来覆盖现有的vnodes
  // 这种情况下得先卸载
  prevChildren: any,
  parentComponent: any,
  parentSuspense: any,
  unmountChildren: any
) {
  if ((key === 'innerHTML' || key === 'textContent') && prevChildren != null) {
    unmountChildren(prevChildren, parentComponent, parentSuspense)
  }
  if (key === 'value' && el.tagName !== 'PROGRESS') {
    // store value as _value as well since
    // non-string values will be stringified.
    el._value = value
  }
  if (value === '' && typeof el[key] === 'boolean') {
    // e.g. <select multiple> compiles to { multiple: '' }
    el[key] = true
  } else {
    el[key] = value == null ? '' : value
  }
}
