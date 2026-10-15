// dados iniciais de um mapa de luz (separado para não carregar a ferramenta inteira só por isto)
const uid = () => Math.random().toString(36).slice(2, 10);
export function newLightmapData({ cameraCode = '', people = [] } = {}) {
  const items = [];
  if (cameraCode) items.push({ id: uid(), kind: 'camera', x: 0, y: 3, rot: -90, code: cameraCode, focal: 35 });
  people.slice(0, 4).forEach((n, i) => items.push({ id: uid(), kind: 'person', x: -0.8 + i * 0.8, y: 0, rot: 0, name: n }));
  return { items };
}
