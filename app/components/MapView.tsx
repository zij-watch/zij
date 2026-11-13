"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { AreaIndexEntry } from "@/lib/data";
import { AREA_FILL_LAYER, syncDataLayers } from "@/lib/map/layers";
import { getBasemapStyle, type Basemap } from "@/lib/map/style";
import type { Theme } from "@/lib/tokens";

interface Props {
  theme: Theme;
  basemap: Basemap;
  date: string; // YYYY-MM-DD, for the satellite basemap
  areas: AreaIndexEntry[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export default function MapView({ theme, basemap, date, areas, selected, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const latest = useRef({ theme, areas, selected, onSelect });
  latest.current = { theme, areas, selected, onSelect };
  const styleKey = `${theme}|${basemap}|${basemap === "satellite" ? date : ""}`;
  const appliedStyle = useRef(styleKey);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    import("maplibre-gl").then((maplibre) => {
      if (cancelled || !container.current) return;
      map = new maplibre.Map({
        container: container.current,
        style: getBasemapStyle(theme, basemap, date),
        center: [10, 15],
        zoom: 1.6,
        maxZoom: 9,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-left");
      // Data layers go back on after every style load, whatever the basemap is.
      map.on("style.load", () => {
        const now = latest.current;
        syncDataLayers(map!, now.theme, now.areas, now.selected);
      });
      map.on("click", AREA_FILL_LAYER, (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (id) latest.current.onSelect(String(id));
      });
      map.on("mouseenter", AREA_FILL_LAYER, () => (map!.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", AREA_FILL_LAYER, () => (map!.getCanvas().style.cursor = ""));
    });
    return () => {
      cancelled = true;
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the basemap. This is the only call to setStyle, and the style comes from getBasemapStyle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedStyle.current === styleKey) return;
    appliedStyle.current = styleKey;
    map.setStyle(getBasemapStyle(theme, basemap, date));
  }, [styleKey, theme, basemap, date]);

  // Area boxes, their name labels, and the view.
  useEffect(() => {
    let cancelled = false;
    const apply = async () => {
      const maplibre = await import("maplibre-gl");
      const map = mapRef.current;
      if (cancelled || !map) return;
      if (map.isStyleLoaded()) syncDataLayers(map, theme, areas, selected);
      markers.current.forEach((marker) => marker.remove());
      markers.current = areas.map((area) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = `map-label${area.id === selected ? " is-selected" : ""}`;
        element.textContent = area.name;
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          latest.current.onSelect(area.id);
        });
        return new maplibre.Marker({ element, anchor: "bottom" })
          .setLngLat([(area.box[0] + area.box[2]) / 2, area.box[3]])
          .addTo(map);
      });
      const area = areas.find((a) => a.id === selected);
      if (area) {
        const [w, s, e, n] = area.box;
        map.fitBounds([[w, s], [e, n]], { padding: 90, maxZoom: 8, duration: 1200 });
      }
    };
    // The map is created asynchronously; wait a tick for it on first render.
    const timer = setTimeout(apply, mapRef.current ? 0 : 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [areas, selected, theme]);

  return <div ref={container} className="map" aria-label="Map of the preset areas" />;
}
