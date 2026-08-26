import { Timestamp } from '@angular/fire/firestore';

// ─── Cost Center Type ─────────────────────────────────────────────────────────

export type CostCenterType = 'centro' | 'proyecto' | 'departamento';

export const COST_CENTER_TYPE_LABELS: Record<CostCenterType, string> = {
  centro:       'Centro de Costo',
  proyecto:     'Proyecto',
  departamento: 'Departamento'
};

export const COST_CENTER_TYPE_COLORS: Record<CostCenterType, string> = {
  centro:       'primary',
  proyecto:     'info',
  departamento: 'secondary'
};

// ─── Cost Center document ─────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/cost_centers/{costCenterId}

export interface CostCenter {
  id: string;
  code: string;              // e.g. "CC001", "PRY-2025-01"
  name: string;
  description?: string;
  type: CostCenterType;
  parentId: string | null;   // null = root cost center
  isActive: boolean;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy?: string;
}

// ─── Tree node (UI only) ──────────────────────────────────────────────────────

export interface CostCenterTreeNode extends CostCenter {
  children: CostCenterTreeNode[];
  expanded: boolean;
  depth: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function buildCostCenterTree(centers: CostCenter[]): CostCenterTreeNode[] {
  const map = new Map<string, CostCenterTreeNode>();

  for (const cc of centers) {
    map.set(cc.id, { ...cc, children: [], expanded: false, depth: 0 });
  }

  const roots: CostCenterTreeNode[] = [];
  for (const node of map.values()) {
    if (!node.parentId) {
      roots.push(node);
    } else {
      const parent = map.get(node.parentId);
      if (parent) {
        node.depth = parent.depth + 1;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  return roots;
}

// ─── Flatten tree (respects expanded state) ───────────────────────────────────

export function flattenCostCenterTree(nodes: CostCenterTreeNode[]): CostCenterTreeNode[] {
  const result: CostCenterTreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.expanded && node.children.length) {
      result.push(...flattenCostCenterTree(node.children));
    }
  }
  return result;
}
