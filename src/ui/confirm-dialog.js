import { createView } from './dom.js';

export function createConfirmDialog(parent = document.body) {
  const { element, get: $ } = createView(`<dialog id="confirmDialog">
      <form method="dialog">
        <h2 id="confirmTitle">确认操作</h2>
        <p id="confirmText"></p>
        <div class="dialog-actions">
          <button value="cancel" formnovalidate>取消</button
          ><button value="confirm" class="primary">确认</button>
        </div>
      </form>
    </dialog>`);
  parent.append(element);
  return {
    open(title, text) {
      $('confirmTitle').textContent = title;
      $('confirmText').textContent = text;
      element.returnValue = 'cancel';
      element.showModal();
      element.querySelector('[value=cancel]').focus();
      return new Promise((resolve) =>
        element.addEventListener('close', () => resolve(element.returnValue === 'confirm'), {
          once: true,
        }),
      );
    },
  };
}
