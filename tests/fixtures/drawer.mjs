// Follow the same task navigation as a user before touching a drawer control.
export async function showDrawerControl(page, name) {
 const field=page.locator(`[data-et="${name}"]`);
 const key=await field.evaluate(node=>node.closest('[data-choir-panel]')?.dataset.choirPanel);
 if(key)await page.locator(`[data-choir-tab="${key}"]`).click();
 const details=page.locator('details').filter({has:field});
 for(let index=0;index<await details.count();index++)if(await details.nth(index).getAttribute('open')===null)await details.nth(index).locator('summary').first().click();
 if(await field.evaluate(node=>node.matches('details')) && await field.getAttribute('open')===null)await field.locator('summary').first().click();
}

export async function withDrawerControl(page, name, action) {
 await showDrawerControl(page,name);return action();
}
