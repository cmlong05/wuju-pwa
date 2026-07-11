# 容器父节点选择修复与小幅精简 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复容器编辑页父容器候选范围过窄的问题，并抽出一个小型 helper 让容器父节点筛选逻辑更清晰。

**Architecture:** 把“可选父容器”筛选从 `renderContainerEdit()` 中拆出来，交给 `js/db.js` 里的一个数据层 helper 统一计算。UI 只负责渲染下拉框和保存 `parentId`，并继续沿用现有的循环检查与保存路径。

**Tech Stack:** Vanilla JS, Dexie.js, IndexedDB, static HTML/PWA.

---

### Task 1: Add an eligible-parent helper in the data layer

**Files:**
- Modify: `js/db.js:1-338`

- [ ] **Step 1: Add the helper implementation**

```javascript
async function getEligibleParentContainers(containerId) {
  const allContainers = await db.containers.toArray();
  if (!containerId) {
    return allContainers.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const forbiddenIds = new Set(await getAllDescendantIds(containerId));
  return allContainers
    .filter(c => !forbiddenIds.has(c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
```

- [ ] **Step 2: Verify the file still parses**

Run: `node --check js/db.js`
Expected: no syntax errors

- [ ] **Step 3: Commit the data-layer change**

```bash
git add js/db.js
git commit -m "refactor: add eligible container parent helper"
```

### Task 2: Use the helper in the container editor

**Files:**
- Modify: `js/app.js:1-1614`

- [ ] **Step 1: Replace the root-only parent lookup**

```javascript
  const candidates = await getEligibleParentContainers(containerId);
  const parentSelect = h('select', { id: 'cedit-parent' });
  parentSelect.appendChild(h('option', { value: '', selected: (!isEdit && !presetParentId) || c?.parentId === '' ? 'selected' : undefined }, '顶层（无父容器）'));
  for (const candidate of candidates) {
    if (candidate.id === containerId) continue;
    parentSelect.appendChild(h('option', {
      value: candidate.id,
      selected: c?.parentId === candidate.id || (!isEdit && presetParentId === candidate.id) ? 'selected' : undefined
    }, candidate.icon + ' ' + candidate.name));
  }
```

- [ ] **Step 2: Keep the existing save path unchanged**

```javascript
    const parentId = $('#cedit-parent').value;
    if (isEdit) {
      await db.containers.update(containerId, { name, icon, color, parentId, notes, image: cImageData });
    } else {
      const maxSort = await db.containers.where('parentId').equals(parentId).count();
      await db.containers.put({
        id: uuid(), name, icon, color, sortOrder: maxSort,
        notes, parentId, createdAt: Date.now(), image: cImageData
      });
    }
```

- [ ] **Step 3: Verify the app file parses**

Run: `node --check js/app.js`
Expected: no syntax errors

- [ ] **Step 4: Commit the UI change**

```bash
git add js/app.js
git commit -m "fix: allow choosing any valid parent container"
```

### Task 3: Run a focused sanity check

**Files:**
- Modify: none

- [ ] **Step 1: Check the repo diff**

Run: `git --no-pager diff -- js/app.js js/db.js`
Expected: only the helper and container editor changes appear

- [ ] **Step 2: Confirm the working tree is clean except the intended edits**

Run: `git status --short`
Expected: only the planned files are modified or committed

- [ ] **Step 3: Manually verify the product behavior**

Open the app in a browser, create or edit a nested container, and confirm:
1. The parent dropdown shows non-root valid containers.
2. The current container and its descendants are excluded.
3. Saving still updates the tree correctly.

