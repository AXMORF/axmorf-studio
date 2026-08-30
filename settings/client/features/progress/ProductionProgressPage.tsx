import { useProductionProgress } from "../../hooks/useProductionProgress";
import { ProductionProgressPanel } from "./ProductionProgressPanel";

export const ProductionProgressPage = () => {
  const production = useProductionProgress();
  return (
    <ProductionProgressPanel
      progress={production.progress}
      status={production.status}
      error={production.error}
      refresh={production.refresh}
      deleteProject={production.deleteProject}
    />
  );
};
