import * as maplibregl from "https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs";

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const PLANTS_URL = "./data/plants.geojson";
const SPECIES_MENU_URL = "./data/especes-menu.json";
const ORIGINS_MENU_URL = "./data/origines-menu.json";
const FAMILIES_MENU_URL = "./data/familles-menu.json";
const PLANT_LAYER_ID = "arboretum-plant-points";
const PLANT_LABEL_LAYER_ID = "arboretum-plant-initials";
const PLANT_RADIUS_STOPS = [
  [13, 3],
  [17, 5],
  [20, 18],
  [21, 18]
];
const PLANT_RADIUS_EXPRESSION = [
  "interpolate",
  ["linear"],
  ["zoom"],
  ...PLANT_RADIUS_STOPS.flat()
];
// Default colour for genera without a specific colour
const DEFAULT_PLANT_COLOR = "#4BA13B";
// Specific colours by botanical genus
const GENUS_COLORS = {

  Platanus: "#5D9E4D",
  Prunus: "#B15695",
  Aesculus: "#A9C344",
  Styphnolobium: "#E6EF98",
  Tilia: "#80C08B",
  Acer: "#C7885F",
  Celtis: "#66845D",
  Pyrus: "#CFD690",
  Carpinus: "#52956C",
  Alnus: "#4BA13B",
  Corylus: "#4B375C",
  Fraxinus: "#C5B447"
};
const GENUS_COLOR_EXPRESSION = [
  "match",
  ["get", "genre"],
  ...Object.entries(GENUS_COLORS).flat(),
  DEFAULT_PLANT_COLOR
];
const errorElement = document.querySelector("#map-error");
const mapFilters = document.querySelector(".map-filters");
const filterDropdowns = [
  ...mapFilters.querySelectorAll(".filter-dropdown")
];
const plantPanel = document.querySelector("#plant-panel");
const plantDetails = document.querySelector("#plant-details");
const plantTitle = document.querySelector("#plant-title");
const plantPanelClose = document.querySelector("#plant-panel-close");
const aboutOpenButton = document.querySelector("#about-open");
const aboutOverlay = document.querySelector("#about-overlay");
const aboutPanel = document.querySelector(".about-panel");
const aboutCloseButton = document.querySelector("#about-close");

const speciesSearch = document.querySelector("#species-search");
const speciesList = document.querySelector("#species-list");
const speciesSelectionCount = document.querySelector("#species-selection-count");
const speciesClear = document.querySelector("#species-clear");
const speciesFilter = document.querySelector("#species-filter");
const remarkableFilter = document.querySelector("#remarkable-filter");

const originList = document.querySelector("#origin-list");
const originSelectionCount = document.querySelector("#origin-selection-count");
const originFilter = document.querySelector("#origin-filter");

const familyList = document.querySelector("#family-list");
const familySelectionCount = document.querySelector("#family-selection-count");
const familyFilter = document.querySelector("#family-filter");
const filtersReset = document.querySelector("#filters-reset");

let speciesMenu = [];
let selectedTaxa = new Set();
let originsMenu = [];
let selectedOrigins = new Set();
let familiesMenu = [];
let selectedFamilies = new Set();
let remarkablePulseMarkers = [];
let filterTouchDragPanWasEnabled = null;

const map = new maplibregl.Map({
  container: "map",
  style: MAP_STYLE_URL,
  center: [2.273, 48.7705],
  zoom: 16,
  maxZoom: 21,
  minZoom: 11,
  attributionControl: false,
  maplibreLogo: true,
  logoPosition: "bottom-left"
});

// Map controls: top to bottom = location, fullscreen, navigation, scale.
map.addControl(
  new maplibregl.ScaleControl({ unit: "metric", maxWidth: 110 }),
  "bottom-right"
);
map.addControl(
  new maplibregl.NavigationControl({ showCompass: true }),
  "bottom-right"
);
map.addControl(new maplibregl.FullscreenControl(), "bottom-right");
map.addControl(
  new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: false,
    showUserLocation: true
  }),
  "bottom-right"
);


map.addControl(
  new maplibregl.AttributionControl({ compact: true }),
  "bottom-left"
);

function showError(message) {
  errorElement.textContent = message;
  errorElement.hidden = false;
}

function cleanValue(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function addPlantField(label, value, extraClass = "") {
  const clean = cleanValue(value);
  if (!clean) return;

  const field = document.createElement("div");
  field.className = `plant-field ${extraClass}`;

  const labelElement = document.createElement("div");
  labelElement.className = "plant-field-label";
  labelElement.textContent = `${label} :`;

  const valueElement = document.createElement("div");
  valueElement.className = "plant-field-value";
  valueElement.textContent = clean;

  field.append(labelElement, valueElement);
  plantDetails.append(field);
}

function showPlant(properties = {}) {
  plantDetails.replaceChildren();

  const commonName = cleanValue(properties.nom_vernaculaire);
  const scientificName = cleanValue(properties.nom_latin);

  // Choose the popup title
  plantTitle.textContent =
    commonName || scientificName || "Aucune information disponible";

  // Show the scientific name as a field only when
  // it isn't already being used as the title.
  if (commonName && scientificName) {
    addPlantField(
      "Nom scientifique",
      scientificName,
      "plant-field--scientific"
    );
  }

  addPlantField("Famille", properties.famille);
  addPlantField("Collection", properties.collection);
  addPlantField("Plantation", properties.plantation);

  const continent = cleanValue(properties.continent);
  const originePrecise = cleanValue(properties.orig_geo);

  const origine = continent && originePrecise
    ? `${continent} (${originePrecise})`
    : continent || originePrecise;

  addPlantField("Origine", origine);

  plantPanel.hidden = false;
}

function updateSpeciesSelectionSummary() {
  const count = selectedTaxa.size;

  speciesSelectionCount.textContent =
    count === 0
      ? "Toutes"
      : count === 1
        ? "1 sélection"
        : `${count} sélectionnées`;

  speciesClear.disabled = count === 0;
}


function applyFilters() {
  const activeFilters = [
    [speciesFilter, selectedTaxa.size > 0],
    [familyFilter, selectedFamilies.size > 0],
    [originFilter, selectedOrigins.size > 0],
    [remarkableFilter.closest(".filter-toggle"), remarkableFilter.checked]
  ];
  const hasActiveFilters = activeFilters.some(([, active]) => active);

  activeFilters.forEach(([element, active]) => {
    element.classList.toggle("is-active", active);
  });
  filtersReset.hidden = !hasActiveFilters;
  updateRemarkablePulseVisibility();

  if (!map.getLayer(PLANT_LAYER_ID)) return;

  const filters = [];

  // Filter by selected species
  if (selectedTaxa.size > 0) {
    filters.push([
      "in",
      ["get", "taxon_key"],
      ["literal", Array.from(selectedTaxa)]
    ]);
  }

  // Filter by remarkable collection
  if (remarkableFilter.checked) {
    filters.push([
      "==",
      ["get", "collection"],
      "Arbre remarquable"
    ]);
  }
  // Filter by selected origins
  if (selectedOrigins.size > 0) {
    filters.push([
      "any",
      ...Array.from(selectedOrigins, (origin) => [
        "in",
        origin,
        ["get", "continent"]
      ])
    ]);
  }
  // Filter by selected families
  if (selectedFamilies.size > 0) {
    filters.push([
      "in",
      ["get", "famille"],
      ["literal", Array.from(selectedFamilies)]
    ]);
  }
  // Combine active filters
  const filter = filters.length > 1
    ? ["all", ...filters]
    : filters[0] ?? null;

  map.setFilter(PLANT_LAYER_ID, filter);
  if (map.getLayer(PLANT_LABEL_LAYER_ID)) {
    const hasPlantInitials = [
      "all",
      ["!=", ["coalesce", ["get", "genre"], ""], ""],
      ["!=", ["coalesce", ["get", "espece"], ""], ""]
    ];
    map.setFilter(
      PLANT_LABEL_LAYER_ID,
      filter ? ["all", hasPlantInitials, filter] : hasPlantInitials
    );
  }
}


function renderSpeciesList() {
  speciesList.replaceChildren();

  const searchText = speciesSearch.value
    .trim()
    .toLocaleLowerCase("fr");

  const matchingSpecies = speciesMenu.filter((species) =>
    species.libelle_espece
      .toLocaleLowerCase("fr")
      .includes(searchText)
  );

  if (matchingSpecies.length === 0) {
    const message = document.createElement("p");
    message.className = "species-placeholder";
    message.textContent = "Aucune espèce trouvée.";
    speciesList.append(message);
    return;
  }

  matchingSpecies.forEach((species) => {
    const row = document.createElement("label");
    row.className = "species-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedTaxa.has(species.taxon_key);

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedTaxa.add(species.taxon_key);
      } else {
        selectedTaxa.delete(species.taxon_key);
      }

      applyFilters();
      updateSpeciesSelectionSummary();
    });

    const name = document.createElement("span");
    name.className = "species-name";
    name.textContent = species.libelle_espece;

    const count = document.createElement("span");
    count.className = "species-count";
    count.textContent = Number(species.effectif).toLocaleString("fr-FR");

    row.append(checkbox, name, count);
    speciesList.append(row);
  });
}

function updateOriginSelectionSummary() {
  const count = selectedOrigins.size;

  originSelectionCount.textContent =
    count === 0
      ? "Toutes"
      : count === 1
        ? "1 sélection"
        : `${count} sélectionnées`;
}

function renderOriginList() {
  originList.replaceChildren();

  originsMenu.forEach((origin) => {
    const row = document.createElement("label");
    row.className = "species-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedOrigins.has(origin.continent);

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedOrigins.add(origin.continent);
      } else {
        selectedOrigins.delete(origin.continent);
      }

      applyFilters();
      updateOriginSelectionSummary();
    });

    const name = document.createElement("span");
    name.className = "species-name";
    name.textContent = origin.continent;

    const count = document.createElement("span");
    count.className = "species-count";
    count.textContent = Number(origin.effectif).toLocaleString("fr-FR");

    row.append(checkbox, name, count);
    originList.append(row);
  });
}

filterDropdowns.forEach((dropdown) => {
  dropdown.addEventListener("toggle", () => {
    if (!dropdown.open) return;

    // Close the plant information panel
    plantPanel.hidden = true;

    // Close all other filter dropdowns
    filterDropdowns.forEach((otherDropdown) => {
      if (otherDropdown !== dropdown) {
        otherDropdown.open = false;
      }
    });
  });
});

async function loadOriginsMenu() {
  try {
    const response = await fetch(ORIGINS_MENU_URL);

    if (!response.ok) {
      throw new Error(`Impossible de charger origines-menu.json (HTTP ${response.status}).`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Le fichier des origines n'a pas le format attendu.");
    }

    originsMenu = data;
    renderOriginList();
    updateOriginSelectionSummary();

  } catch (error) {
    console.error(error);
    originList.textContent = "Impossible de charger la liste des origines.";
  }
}

function updateFamilySelectionSummary() {
  const count = selectedFamilies.size;

  familySelectionCount.textContent =
    count === 0
      ? "Toutes"
      : count === 1
        ? "1 sélection"
        : `${count} sélectionnées`;
}

function renderFamilyList() {
  familyList.replaceChildren();

  familiesMenu.forEach((family) => {
    const row = document.createElement("label");
    row.className = "species-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedFamilies.has(family.famille);

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedFamilies.add(family.famille);
      } else {
        selectedFamilies.delete(family.famille);
      }

      applyFilters();
      updateFamilySelectionSummary();
    });

    const name = document.createElement("span");
    name.className = "species-name";
    name.textContent = family.famille;

    const count = document.createElement("span");
    count.className = "species-count";
    count.textContent = Number(family.effectif).toLocaleString("fr-FR");

    row.append(checkbox, name, count);
    familyList.append(row);
  });
}

async function loadFamiliesMenu() {
  try {
    const response = await fetch(FAMILIES_MENU_URL);

    if (!response.ok) {
      throw new Error(`Impossible de charger familles-menu.json (HTTP ${response.status}).`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Le fichier des familles n'a pas le format attendu.");
    }

    familiesMenu = data;
    renderFamilyList();
    updateFamilySelectionSummary();

  } catch (error) {
    console.error(error);
    familyList.textContent = "Impossible de charger la liste des familles.";
  }
}

async function loadSpeciesMenu() {
  try {
    const response = await fetch(SPECIES_MENU_URL);

    if (!response.ok) {
      throw new Error(
        `Impossible de charger especes-menu.json (HTTP ${response.status}).`
      );
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Le fichier des espèces n'a pas le format attendu.");
    }

    speciesMenu = data;

    renderSpeciesList();
    updateSpeciesSelectionSummary();

  } catch (error) {
    console.error(error);

    speciesList.textContent =
      "Impossible de charger la liste des espèces.";
  }
}


function getPlantBounds(geojson) {
  const coordinates = geojson.features
    .filter((feature) =>
      feature.geometry?.type === "Point" &&
      Array.isArray(feature.geometry.coordinates) &&
      feature.geometry.coordinates.length >= 2
    )
    .map((feature) => feature.geometry.coordinates);

  if (coordinates.length === 0) return null;

  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);

  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)]
  ];
}

function getPlantAtPoint(point) {
  // Give touchscreens a larger clickable area.
  const radius = window.matchMedia("(pointer: coarse)").matches ? 18 : 0;

  const queryArea = radius > 0
    ? [
        [point.x - radius, point.y - radius],
        [point.x + radius, point.y + radius]
      ]
    : point;

  const features = map.queryRenderedFeatures(queryArea, {
    layers: [PLANT_LAYER_ID]
  });

  if (features.length === 0) return null;

  // If several plants are nearby, choose the closest one.
  return features.reduce((nearest, feature) => {
    const screenPoint = map.project(feature.geometry.coordinates);

    const distance = Math.hypot(
      screenPoint.x - point.x,
      screenPoint.y - point.y
    );

    return !nearest || distance < nearest.distance
      ? { feature, distance }
      : nearest;
  }, null).feature;
}

function updateRemarkablePulseVisibility() {
  remarkablePulseMarkers.forEach(({ element, properties }) => {
    const matchesFilters =
      (!selectedTaxa.size || selectedTaxa.has(properties.taxon_key)) &&
      (!selectedFamilies.size || selectedFamilies.has(properties.famille)) &&
      (!selectedOrigins.size || selectedOrigins.has(properties.continent));

    element.hidden = !matchesFilters;
  });
}

function getPlantRadius(zoom) {
  const upperStopIndex = PLANT_RADIUS_STOPS.findIndex(
    ([stopZoom]) => stopZoom >= zoom
  );

  if (upperStopIndex === 0) return PLANT_RADIUS_STOPS[0][1];
  if (upperStopIndex === -1) return PLANT_RADIUS_STOPS.at(-1)[1];

  const [lowerZoom, lowerRadius] = PLANT_RADIUS_STOPS[upperStopIndex - 1];
  const [upperZoom, upperRadius] = PLANT_RADIUS_STOPS[upperStopIndex];
  const progress = (zoom - lowerZoom) / (upperZoom - lowerZoom);

  return lowerRadius + (upperRadius - lowerRadius) * progress;
}

function updateRemarkablePulsePositions() {
  const containerBounds = map.getContainer().getBoundingClientRect();
  const canvasBounds = map.getCanvas().getBoundingClientRect();
  const canvasOffsetX = canvasBounds.left - containerBounds.left;
  const canvasOffsetY = canvasBounds.top - containerBounds.top;
  const markerRadius = getPlantRadius(map.getZoom());
  const diameter = (markerRadius + 5) * 2;

  remarkablePulseMarkers.forEach(({ element, coordinates }) => {
    const point = map.project(coordinates);
    const disc = element.firstElementChild;

    element.style.left = `${point.x + canvasOffsetX}px`;
    element.style.top = `${point.y + canvasOffsetY}px`;
    disc.style.left = `${-diameter / 2}px`;
    disc.style.top = `${-diameter / 2}px`;
    disc.style.width = `${diameter}px`;
    disc.style.height = `${diameter}px`;
  });
}

function addRemarkablePulseMarkers(features) {
  const layer = document.createElement("div");
  layer.className = "remarkable-pulse-layer";

  remarkablePulseMarkers = features
    .filter((feature) =>
      feature.properties?.collection === "Arbre remarquable" &&
      feature.geometry?.type === "Point" &&
      Array.isArray(feature.geometry.coordinates)
    )
    .map((feature) => {
      const element = document.createElement("span");
      element.className = "remarkable-pulse-anchor";

      const disc = document.createElement("span");
      disc.className = "remarkable-pulse-disc";
      disc.style.backgroundColor =
        GENUS_COLORS[feature.properties.genre] ?? DEFAULT_PLANT_COLOR;
      element.append(disc);
      layer.append(element);

      return {
        element,
        coordinates: feature.geometry.coordinates,
        properties: feature.properties
      };
    });

  map.getContainer().append(layer);
  map.on("move", updateRemarkablePulsePositions);
  map.on("resize", updateRemarkablePulsePositions);
  updateRemarkablePulsePositions();
  updateRemarkablePulseVisibility();
}

remarkableFilter.addEventListener("change", applyFilters);
speciesSearch.addEventListener("input", renderSpeciesList);
mapFilters.addEventListener("touchstart", () => {
  if (filterTouchDragPanWasEnabled !== null) return;

  filterTouchDragPanWasEnabled = map.dragPan.isEnabled();
  map.dragPan.disable();
}, { passive: true });

function restoreMapDragAfterFilterTouch(event) {
  if (event.touches.length > 0 || filterTouchDragPanWasEnabled === null) return;
  if (filterTouchDragPanWasEnabled) map.dragPan.enable();
  filterTouchDragPanWasEnabled = null;
}

document.addEventListener("touchend", restoreMapDragAfterFilterTouch, {
  passive: true
});
document.addEventListener("touchcancel", restoreMapDragAfterFilterTouch, {
  passive: true
});

mapFilters.addEventListener("click", () => {
  plantPanel.hidden = true;
});
// About panel: open and close
if (aboutOpenButton && aboutOverlay && aboutPanel && aboutCloseButton) {

  function closeAboutPanel() {
    aboutOverlay.hidden = true;
    aboutOpenButton.focus();
  }

  aboutOpenButton.addEventListener("click", () => {
    // Close any other open panels or filters.
    plantPanel.hidden = true;
    filterDropdowns.forEach((dropdown) => {
      dropdown.open = false;
    });

    aboutOverlay.hidden = false;
    aboutPanel.focus();
  });

  aboutCloseButton.addEventListener("click", closeAboutPanel);

  // Close when clicking outside the content panel.
  aboutOverlay.addEventListener("click", (event) => {
    if (event.target === aboutOverlay) {
      closeAboutPanel();
    }
  });

  // Close with Escape and keep keyboard navigation inside the panel.
  document.addEventListener("keydown", (event) => {
    if (aboutOverlay.hidden) return;

    if (event.key === "Escape") {
      closeAboutPanel();
      return;
    }

    if (event.key !== "Tab") return;

    const focusableElements = [
      ...aboutPanel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ];

    if (focusableElements.length === 0) {
      event.preventDefault();
      aboutPanel.focus();
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];

    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === aboutPanel)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

speciesClear.addEventListener("click", () => {
  selectedTaxa.clear();

  applyFilters();
  updateSpeciesSelectionSummary();
  renderSpeciesList();
});

filtersReset.addEventListener("click", () => {
  selectedTaxa.clear();
  selectedFamilies.clear();
  selectedOrigins.clear();
  remarkableFilter.checked = false;

  applyFilters();
  updateSpeciesSelectionSummary();
  updateFamilySelectionSummary();
  updateOriginSelectionSummary();
  renderSpeciesList();
  renderFamilyList();
  renderOriginList();
});

map.on("error", (event) => {
  if (event.error) console.error("MapLibre error:", event.error);
});

map.on("load", async () => {
  try {
    const response = await fetch(PLANTS_URL);
    if (!response.ok) {
      throw new Error(`Le fichier plants.geojson est introuvable (HTTP ${response.status}).`);
    }

    const plants = await response.json();
    if (plants.type !== "FeatureCollection" || !Array.isArray(plants.features)) {
      throw new Error("plants.geojson n'a pas la structure GeoJSON attendue.");
    }

    addRemarkablePulseMarkers(plants.features);

    map.addSource("arboretum-plants", {
      type: "geojson",
      data: plants
    });

    map.addLayer({
      id: PLANT_LAYER_ID,
      type: "circle",
      source: "arboretum-plants",
      paint: {
        "circle-radius": PLANT_RADIUS_EXPRESSION,
        "circle-color": GENUS_COLOR_EXPRESSION,
        "circle-opacity": 0.95
      }
    });

    map.addLayer({
      id: PLANT_LABEL_LAYER_ID,
      type: "symbol",
      source: "arboretum-plants",
      minzoom: 18,
      filter: [
        "all",
        ["!=", ["coalesce", ["get", "genre"], ""], ""],
        ["!=", ["coalesce", ["get", "espece"], ""], ""]
      ],
      layout: {
        "symbol-placement": "point",
        "text-field": [
          "concat",
          [
            "upcase",
            ["slice", ["to-string", ["coalesce", ["get", "genre"], ""]], 0, 1]
          ],
          [
            "downcase",
            ["slice", ["to-string", ["coalesce", ["get", "espece"], ""]], 0, 1]
          ]
        ],
        "text-font": ["Noto Sans Bold"],
        "text-size": [
          "interpolate", ["linear"], ["zoom"],
          18, 8,
          20, 12
        ],
        "text-anchor": "center",
        "text-justify": "center",
        "text-allow-overlap": false,
        "text-ignore-placement": false,
        "text-padding": 2
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1
      }
    });

    await loadSpeciesMenu();
    await loadOriginsMenu();
    await loadFamiliesMenu();

    // Register interactions only after the plant layer exists.
    // One map click handler deals with both selecting a plant and closing the panel.
    map.on("click", (event) => {
      filterDropdowns.forEach((dropdown) => {
        dropdown.open = false;
      });

      const feature = getPlantAtPoint(event.point);
      if (feature) {
        showPlant(feature.properties);
      } else {
        plantPanel.hidden = true;
      }
    });

    map.on("mousemove", (event) => {
      map.getCanvas().style.cursor = getPlantAtPoint(event.point)
        ? "pointer"
        : "";
    });

    map.getCanvas().addEventListener("mouseleave", () => {
      map.getCanvas().style.cursor = "";
    });

    plantPanelClose.addEventListener("click", () => {
      plantPanel.hidden = true;
    });

    const bounds = getPlantBounds(plants);
    if (bounds) {
      map.fitBounds(bounds, {
        padding: { top: 85, right: 85, bottom: 85, left: 85 },
        maxZoom: 18,
        duration: 0
      });
    }

  } catch (error) {
    console.error(error);
    showError(error.message || "Une erreur inconnue est survenue.");
  }
});
