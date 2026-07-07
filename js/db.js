/* ── 物居 PWA — IndexedDB Data Layer ── */

// 兼容非 HTTPS 环境的 UUID 生成
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const db = new Dexie('WujuDB');

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

// ── Container helpers ──
async function getRootContainers() {
  return db.containers.where('parentId').equals('').toArray()
    .then(arr => arr.sort((a, b) => a.sortOrder - b.sortOrder));
}

async function getContainerTree(containerId) {
  const c = await db.containers.get(containerId);
  if (!c) return null;
  const children = await db.containers.where('parentId').equals(containerId).toArray();
  children.sort((a, b) => a.sortOrder - b.sortOrder);
  return { ...c, children };
}

async function getContainerPath(containerId) {
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

async function getContainerTotalItems(containerId) {
  let count = await db.items.where('containerId').equals(containerId).count();
  const children = await db.containers.where('parentId').equals(containerId).toArray();
  for (const child of children) {
    count += await getContainerTotalItems(child.id);
  }
  return count;
}

async function getAllDescendantIds(containerId) {
  const ids = [containerId];
  const children = await db.containers.where('parentId').equals(containerId).toArray();
  for (const child of children) {
    ids.push(...await getAllDescendantIds(child.id));
  }
  return ids;
}

async function deleteContainerCascade(containerId) {
  const descIds = await getAllDescendantIds(containerId);
  // Nullify items referencing any of these containers
  await db.items.where('containerId').anyOf(descIds).modify({ containerId: '' });
  // Delete all descendant containers
  await db.containers.bulkDelete(descIds);
}

// ── Item helpers ──
async function getItemsByCategory(category) {
  if (!category) return db.items.orderBy('name').toArray();
  return db.items.where('category').equals(category).sortBy('name');
}

async function getItemsSorted(sortBy) {
  let items = await db.items.toArray();
  switch (sortBy) {
    case 'name': items.sort((a, b) => a.name.localeCompare(b.name, 'zh')); break;
    case 'date': items.sort((a, b) => (b.addedDate || 0) - (a.addedDate || 0)); break;
    case 'expiry': items.sort((a, b) => (a.expiryDate || Infinity) - (b.expiryDate || Infinity)); break;
  }
  return items;
}

async function getExpiredItems() {
  const now = Date.now();
  return db.items.filter(i => i.expiryDate && i.expiryDate < now).toArray();
}

async function getExpiringSoonItems(days = 7) {
  const now = Date.now();
  const threshold = now + days * 86400000;
  return db.items.filter(i => i.expiryDate && i.expiryDate > now && i.expiryDate <= threshold).toArray();
}

async function getLowStockItems(threshold = 1) {
  return db.items.filter(i => i.quantity !== undefined && i.quantity !== null && i.quantity <= threshold).toArray();
}

// ── Relation helpers ──
async function getItemRelations(itemId) {
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

async function deleteItemRelations(itemId) {
  const rels = await db.relations
    .where('sourceId').equals(itemId)
    .or('targetId').equals(itemId)
    .toArray();
  await db.relations.bulkDelete(rels.map(r => r.id));
}

// ── Seed sample data ──
async function seedSampleData() {
  const count = await db.containers.count();
  if (count > 0) return; // already seeded

  const now = Date.now();
  const day = 86400000;

  const homeId = uuid();
  const kitchenId = uuid();
  const fridgeId = uuid();
  const coldId = uuid();
  const freezerId = uuid();
  const cabinetId = uuid();
  const wardrobeId = uuid();

  await db.containers.bulkPut([
    { id: homeId, name: '家', icon: '🏠', color: '#5B8FF9', sortOrder: 0, notes: '', createdAt: now, parentId: '' },
    { id: kitchenId, name: '厨房', icon: '🍽️', color: '#5B8FF9', sortOrder: 0, notes: '', createdAt: now, parentId: homeId },
    { id: fridgeId, name: '冰箱', icon: '❄️', color: '#5B8FF9', sortOrder: 0, notes: '', createdAt: now, parentId: kitchenId },
    { id: coldId, name: '冷藏层', icon: '🧊', color: '#6DC8EC', sortOrder: 0, notes: '', createdAt: now, parentId: fridgeId },
    { id: freezerId, name: '冷冻层', icon: '🧊', color: '#6DC8EC', sortOrder: 1, notes: '', createdAt: now, parentId: fridgeId },
    { id: cabinetId, name: '橱柜', icon: '🗄️', color: '#5B8FF9', sortOrder: 2, notes: '', createdAt: now, parentId: kitchenId },
    { id: wardrobeId, name: '衣柜', icon: '👕', color: '#FF99C3', sortOrder: 1, notes: '', createdAt: now, parentId: homeId },
  ]);

  const eggId = uuid();
  const milkId = uuid();
  const yogurtId = uuid();
  const dumplingId = uuid();
  const riceId = uuid();
  const saltId = uuid();
  const medicineId = uuid();
  const shirtId = uuid();
  const tvId = uuid();
  const remoteId = uuid();
  const spareRemoteId = uuid();
  const sofaId = uuid();

  await db.items.bulkPut([
    { id: eggId, name: '鸡蛋', quantity: 8, category: '食品', expiryDate: now + 7 * day, addedDate: now, notes: '', containerId: coldId },
    { id: milkId, name: '牛奶', quantity: 1, category: '食品', expiryDate: now + 2 * day, addedDate: now, notes: '', containerId: coldId },
    { id: yogurtId, name: '酸奶', quantity: 3, category: '食品', expiryDate: now - 1 * day, addedDate: now, notes: '', containerId: coldId },
    { id: dumplingId, name: '速冻水饺', quantity: 2, category: '食品', expiryDate: now + 60 * day, addedDate: now, notes: '', containerId: freezerId },
    { id: riceId, name: '大米', quantity: 1, category: '食品', expiryDate: null, addedDate: now, notes: '', containerId: cabinetId },
    { id: saltId, name: '盐', quantity: 1, category: '食品', expiryDate: null, addedDate: now, notes: '', containerId: cabinetId },
    { id: medicineId, name: '感冒药', quantity: 1, category: '药品', expiryDate: now + 30 * day, addedDate: now, notes: '', containerId: '' },
    { id: shirtId, name: '白衬衫', quantity: 3, category: '衣物', expiryDate: null, addedDate: now, notes: '', containerId: wardrobeId },
    { id: tvId, name: '电视机', quantity: null, category: '电子', expiryDate: null, addedDate: now, notes: '', containerId: '' },
    { id: remoteId, name: '遥控器', quantity: null, category: '电子', expiryDate: null, addedDate: now, notes: '', containerId: '' },
    { id: spareRemoteId, name: '备用遥控器', quantity: null, category: '电子', expiryDate: null, addedDate: now, notes: '', containerId: '' },
    { id: sofaId, name: '沙发', quantity: null, category: '装饰', expiryDate: null, addedDate: now, notes: '', containerId: '' },
  ]);

  await db.relations.bulkPut([
    { id: uuid(), sourceId: remoteId, targetId: tvId, relationType: '属于', notes: '原装遥控器', createdAt: now },
    { id: uuid(), sourceId: spareRemoteId, targetId: remoteId, relationType: '备用', notes: '淘宝买的', createdAt: now },
  ]);
}
