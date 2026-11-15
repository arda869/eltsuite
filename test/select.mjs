// Choose through the same styled menu a teacher sees, using the option's saved value.
export async function chooseSelect(page, trigger, value) {
  await trigger.click();
  const choices = page.locator('.sel-list:visible [role="option"]');
  await choices.first().waitFor();
  const index = await choices.evaluateAll((nodes, expected) =>
    nodes.findIndex((node) => node.getAttribute('data-value') === String(expected)), value);
  if (index < 0) throw new Error(`Dropdown option ${value} is unavailable`);
  await choices.nth(index).click();
}
