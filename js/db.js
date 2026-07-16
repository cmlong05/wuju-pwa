/* ── 居雅 PWA — IndexedDB Data Layer ── */

// 兼容非 HTTPS 环境的 UUID 生成
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export const db = new Dexie('WujuDB');

db.version(1).stores({
  containers: 'id, name, parentId, sortOrder',
  items: 'id, name, category, containerId, expiryDate, addedDate',
  relations: 'id, sourceId, targetId, relationType'
});

db.version(2).stores({
  containers: 'id, name, parentId, sortOrder',
  items: 'id, name, category, containerId, expiryDate, addedDate',
  relations: 'id, sourceId, targetId, relationType'
}).upgrade(tx => {
  return tx.table('items').toCollection().modify(item => {
    if (!item.image) item.image = '';
  }).then(() => {
    return tx.table('containers').toCollection().modify(c => {
      if (!c.image) c.image = '';
    });
  });
});

db.version(3).stores({
  containers: 'id, name, parentId, sortOrder',
  items: 'id, name, category, containerId, expiryDate, addedDate',
  relations: 'id, sourceId, targetId, relationType'
}).upgrade(tx => {
  return tx.table('items').toCollection().modify(item => {
    if (!item.qrCode) item.qrCode = '';
  }).then(() => {
    return tx.table('containers').toCollection().modify(c => {
      if (!c.qrCode) c.qrCode = '';
    });
  });
});

db.version(4).stores({
  containers: 'id, name, parentId, sortOrder',
  items: 'id, name, category, containerId, expiryDate, addedDate',
  relations: 'id, sourceId, targetId, relationType',
  categories: 'id, name, sortOrder'
});

db.version(5).stores({
  containers: 'id, name, parentId, sortOrder',
  items: 'id, name, category, containerId, expiryDate, addedDate',
  relations: 'id, sourceId, targetId, relationType',
  categories: 'id, name, sortOrder',
  tags: 'id, name, sortOrder'
}).upgrade(tx => {
  return tx.table('items').toCollection().modify(item => {
    if (!item.tags) item.tags = [];
  });
});

db.version(6).stores({
  containers: 'id, name, parentId, sortOrder, qrCode',
  items: 'id, name, category, containerId, expiryDate, addedDate, quantity, qrCode',
  relations: 'id, sourceId, targetId, relationType',
  categories: 'id, name, sortOrder',
  tags: 'id, name, sortOrder'
});

// ── Category helpers ──
const DEFAULT_CATEGORIES = [
  { name: '食品', icon: '🍎' },
  { name: '药品', icon: '💊' },
  { name: '衣物', icon: '👕' },
  { name: '工具', icon: '🔧' },
  { name: '电子', icon: '📺' },
  { name: '文具', icon: '✏️' },
  { name: '清洁', icon: '🧹' },
  { name: '装饰', icon: '🎨' },
  { name: '其他', icon: '📦' },
];

async function seedDefaultCategories() {
  const count = await db.categories.count();
  if (count > 0) return;
  const now = Date.now();
  await db.categories.bulkPut(
    DEFAULT_CATEGORIES.map((c, i) => ({
      id: uuid(), name: c.name, icon: c.icon, sortOrder: i, createdAt: now
    }))
  );
}

export async function getCategories() {
  const cats = await db.categories.orderBy('sortOrder').toArray();
  if (cats.length === 0) {
    // First run — seed defaults and return them
    await seedDefaultCategories();
    return db.categories.orderBy('sortOrder').toArray();
  }
  return cats;
}

export async function addCategory(name, icon) {
  const maxSort = await db.categories.count();
  await db.categories.put({
    id: uuid(), name, icon, sortOrder: maxSort, createdAt: Date.now()
  });
}

export async function updateCategory(id, name, icon) {
  await db.categories.update(id, { name, icon });
}

export async function deleteCategory(id) {
  const cat = await db.categories.get(id);
  if (!cat) return;
  // Check if any items use this category
  const used = await db.items.where('category').equals(cat.name).count();
  if (used > 0) return false; // can't delete — items still use it
  await db.categories.delete(id);
  return true;
}

// ── Tag helpers ──
const DEFAULT_TAGS = [
  { name: '冷藏', icon: '❄️' },
  { name: '冷冻', icon: '🧊' },
  { name: '干货', icon: '🥜' },
  { name: '易碎', icon: '💎' },
  { name: '常用', icon: '⭐' },
  { name: '有机', icon: '🌿' },
];

async function seedDefaultTags() {
  const count = await db.tags.count();
  if (count > 0) return;
  const now = Date.now();
  await db.tags.bulkPut(
    DEFAULT_TAGS.map((t, i) => ({
      id: uuid(), name: t.name, icon: t.icon, sortOrder: i, createdAt: now
    }))
  );
}

export async function getTags() {
  const tags = await db.tags.orderBy('sortOrder').toArray();
  if (tags.length === 0) {
    await seedDefaultTags();
    return db.tags.orderBy('sortOrder').toArray();
  }
  return tags;
}

export async function addTag(name, icon) {
  const maxSort = await db.tags.count();
  await db.tags.put({
    id: uuid(), name, icon, sortOrder: maxSort, createdAt: Date.now()
  });
}

export async function updateTag(id, name, icon) {
  await db.tags.update(id, { name, icon });
}

export async function deleteTag(id) {
  const tag = await db.tags.get(id);
  if (!tag) return;
  const tagName = tag.name;
  const used = await db.items.filter(i => i.tags && i.tags.includes(tagName)).count();
  if (used > 0) return false;
  await db.tags.delete(id);
  return true;
}

// ── Container helpers ──
export async function getRootContainers() {
  return db.containers.where('parentId').equals('').toArray()
    .then(arr => arr.sort((a, b) => a.sortOrder - b.sortOrder));
}

export async function getEligibleParentContainers(containerId) {
  const allContainers = await db.containers.toArray();
  if (!containerId) {
    return allContainers.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const forbiddenIds = new Set(await getAllDescendantIds(containerId));
  return allContainers
    .filter(container => !forbiddenIds.has(container.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getContainerTree(containerId) {
  const c = await db.containers.get(containerId);
  if (!c) return null;
  const children = await db.containers.where('parentId').equals(containerId).toArray();
  children.sort((a, b) => a.sortOrder - b.sortOrder);
  return { ...c, children };
}

export async function getContainerPath(containerId) {
  const path = [];
  let currentId = containerId;
  while (currentId) {
    const c = await db.containers.get(currentId);
    if (!c) break;
    path.unshift(c);
    currentId = c.parentId || '';
  }
  return path;
}

export async function getContainerTotalItems(containerId) {
  let count = await db.items.where('containerId').equals(containerId).count();
  const children = await db.containers.where('parentId').equals(containerId).toArray();
  for (const child of children) {
    count += await getContainerTotalItems(child.id);
  }
  return count;
}

export async function getAllDescendantIds(containerId) {
  const ids = [containerId];
  const children = await db.containers.where('parentId').equals(containerId).toArray();
  for (const child of children) {
    ids.push(...await getAllDescendantIds(child.id));
  }
  return ids;
}

export async function deleteContainerCascade(containerId) {
  const descIds = await getAllDescendantIds(containerId);
  // Nullify items referencing any of these containers
  await db.items.where('containerId').anyOf(descIds).modify({ containerId: '' });
  // Delete all descendant containers
  await db.containers.bulkDelete(descIds);
}

// ── Item helpers ──
export async function getItemsByCategory(category) {
  if (!category) return db.items.orderBy('name').toArray();
  return db.items.where('category').equals(category).sortBy('name');
}

export async function getExpiredItems() {
  const now = Date.now();
  return db.items.where('expiryDate').below(now).toArray();
}

export async function getExpiringSoonItems(days = 7) {
  const now = Date.now();
  const threshold = now + days * 86400000;
  return db.items.where('expiryDate').between(now, threshold, true, true).toArray();
}

export async function getLowStockItems(threshold = 1) {
  return db.items.where('quantity').belowOrEqual(threshold).toArray();
}

// ── Relation helpers ──
export async function getItemRelations(itemId) {
  const outgoing = await db.relations.where('sourceId').equals(itemId).toArray();
  const incoming = await db.relations.where('targetId').equals(itemId).toArray();

  const result = [];
  for (const rel of outgoing) {
    const item = await db.items.get(rel.targetId);
    if (item) result.push({ relation: rel, item });
  }
  for (const rel of incoming) {
    const item = await db.items.get(rel.sourceId);
    if (item) result.push({ relation: rel, item });
  }
  return result;
}

export async function deleteItemRelations(itemId) {
  const rels = await db.relations
    .where('sourceId').equals(itemId)
    .or('targetId').equals(itemId)
    .toArray();
  await db.relations.bulkDelete(rels.map(r => r.id));
}

// ── Seed sample data ──
export async function seedSampleData() {
  const count = await db.containers.count();
  if (count > 0) return; // already seeded

  const now = Date.now();
  const day = 86400000;

  const homeId = uuid();
  const kitchenId = uuid();
  const fridgeId = uuid();

  await db.containers.bulkPut([
    { id: homeId, name: '家', icon: '🏠', color: '#5B8FF9', sortOrder: 0, notes: '', createdAt: now, parentId: '' },
    { id: kitchenId, name: '厨房', icon: '🍽️', color: '#5B8FF9', sortOrder: 0, notes: '', createdAt: now, parentId: homeId },
    { id: fridgeId, name: '冰箱', icon: '❄️', color: '#6DC8EC', sortOrder: 0, notes: '', createdAt: now, parentId: kitchenId },
  ]);

  await db.items.bulkPut([
    { id: uuid(), name: '鸡蛋', quantity: 8, category: '食品', tags: ['冷藏', '常用'], expiryDate: now + 7 * day, addedDate: now, notes: '', containerId: fridgeId },
    { id: uuid(), name: '牛奶', quantity: 1, category: '食品', tags: ['冷藏'], expiryDate: now + 2 * day, addedDate: now, notes: '', containerId: fridgeId },
    { id: uuid(), name: '感冒药', quantity: 1, category: '药品', expiryDate: now + 30 * day, addedDate: now, notes: '', containerId: '' },
  ]);
}
