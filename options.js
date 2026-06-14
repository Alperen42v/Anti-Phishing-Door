const domainInput = document.getElementById('domain-input');
const addBtn = document.getElementById('add-btn');
const customList = document.getElementById('custom-list');

function loadCustomDomains() {
  browser.storage.local.get({ customWhitelist: [] }).then((result) => {
    customList.innerHTML = '';
    result.customWhitelist.forEach((domain) => {
      const li = document.createElement('li');
      li.textContent = domain;
      const delBtn = document.createElement('button');
      delBtn.textContent = 'X';
      delBtn.className = 'delete-btn';
      delBtn.addEventListener('click', () => {
        removeDomain(domain);
      });
      li.appendChild(delBtn);
      customList.appendChild(li);
    });
  });
}

function removeDomain(domain) {
  browser.storage.local.get({ customWhitelist: [] }).then((result) => {
    let list = result.customWhitelist.filter(d => d !== domain);
    browser.storage.local.set({ customWhitelist: list }).then(loadCustomDomains);
  });
}

addBtn.addEventListener('click', () => {
  const domain = domainInput.value.trim().toLowerCase();
  if (domain) {
    browser.storage.local.get({ customWhitelist: [] }).then((result) => {
      let list = result.customWhitelist;
      if (!list.includes(domain)) {
        list.push(domain);
        browser.storage.local.set({ customWhitelist: list }).then(() => {
          domainInput.value = '';
          loadCustomDomains();
        });
      }
    });
  }
});

document.addEventListener('DOMContentLoaded', loadCustomDomains);