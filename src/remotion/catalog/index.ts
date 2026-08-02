import rawResourceCatalog from "./resource-catalog.generated.json";

import { ResourceCatalogSchema } from "../../contracts";

export const resourceCatalog = ResourceCatalogSchema.parse(rawResourceCatalog);
