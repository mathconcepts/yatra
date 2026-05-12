/**
 * Location registry. To add a new location:
 *   1. Create `src/config/<your-location>.js`, exporting a LocationConfig
 *   2. Import it below and add to LOCATIONS
 * That's it — the UI picks it up automatically.
 */
import tirupatiTirumala from "./tirupati-tirumala";
import srirangamTrichy  from "./srirangam-trichy";
import yadagirigutta    from "./yadagirigutta";
import konkanRailway    from "./konkan-railway";

export const LOCATIONS = {
  [tirupatiTirumala.id]: tirupatiTirumala,
  [srirangamTrichy.id]:  srirangamTrichy,
  [yadagirigutta.id]:    yadagirigutta,
  [konkanRailway.id]:    konkanRailway,
};
