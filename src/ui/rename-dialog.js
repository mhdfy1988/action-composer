import { createView } from './dom.js';

export function createRenameDialog(parent = document.body) {
  const { element, get: $ } = createView(`<dialog id="renameDialog">
      <form method="dialog">
        <h2>修改动作名称</h2>
        <label>动作名称<input id="renameName" maxlength="160" required /></label>
        <div class="dialog-actions">
          <button id="renameCancel" type="button">取消</button
          ><button id="renameConfirm" type="submit" class="primary">确定</button>
        </div>
      </form>
    </dialog>`);
  parent.append(element);
  let submit = null;
  $('renameCancel').onclick = () => {
    submit = null;
    element.close();
  };
  element.addEventListener('cancel', () => {
    submit = null;
  });
  element.querySelector('form').onsubmit = (event) => {
    event.preventDefault();
    const name = $('renameName').value.trim();
    if (!name) return;
    const onConfirm = submit;
    submit = null;
    element.close();
    onConfirm?.(name);
  };
  return {
    open(name, onConfirm) {
      submit = onConfirm;
      $('renameName').value = name;
      element.showModal();
      $('renameName').select();
    },
  };
}
