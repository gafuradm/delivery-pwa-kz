let map;

async function initYandexMap() {
  await ymaps3.ready;

  const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer } = ymaps3;

  map = new YMap(document.getElementById('map'), {
    location: { center: [76.95, 43.25], zoom: 12 }
  });

  map.addChild(new YMapDefaultSchemeLayer());
  map.addChild(new YMapDefaultFeaturesLayer());
}

function setPointA(text) {
  document.getElementById("pointA").value = text;
}

function setPointB(text) {
  document.getElementById("pointB").value = text;
}