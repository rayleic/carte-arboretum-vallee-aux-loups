# Carte interactive de l'Arboretum de la Vallée-aux-Loups

An interactive botanical map of the Arboretum du Domaine départemental de la Vallée-aux-Loups, in Châtenay-Malabry, South-West of Paris, France.

The map allows visitors to explore the arboretum's trees and plants, discover botanical information and filter the inventory by species, family, origin and remarkable collection.

## Data source

The botanical inventory comes from the open-data platform of the Île-de-France region:

[Inventaire botanique de l'Arboretum de la Vallée-aux-Loups](https://data.iledefrance.fr/explore/dataset/inventaire-botanique-de-larboretum-du-domaine-departemental-de-la-vallee-aux-lou/)

The original inventory file is not redistributed in this repository. The GeoJSON and JSON files in `website/data/` are processed files used by the interactive map.

## Project structure

- `TraitementDonnees.Rmd`: data preparation and processing with R.
- `website/`: website source code.
- `website/data/`: processed geographic data and date for filter menus.

## Technologies

- R and R Markdown for data preparation.
- HTML, CSS and JavaScript for the website.
- MapLibre GL JS 6.16.0 for the interactive map.
- OpenFreeMap for the background map.

## Run locally

From the project root, run

python3 -m http.server 8001 --directory website --bind 127.0.0.1

Then open http://127.0.0.1:8001/
