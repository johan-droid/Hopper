-- 0007_link_workspace_organizations.sql
-- Bridges GitHub App installation tenants (organizations) with Hopper workspace tenancies (workspaces)
-- Ensures repositories automatically inherit workspace ownership and RBAC isolation.

-- 1. Add workspace_id to organizations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE organizations 
    ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_organizations_workspace_id ON organizations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_repositories_workspace_id ON repositories(workspace_id);

-- 2. Trigger to automatically inherit workspace_id onto repositories from their parent organization
CREATE OR REPLACE FUNCTION inherit_repository_workspace_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.org_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id 
    FROM organizations 
    WHERE id = NEW.org_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_repo_inherit_workspace ON repositories;
CREATE TRIGGER trg_repo_inherit_workspace
BEFORE INSERT OR UPDATE OF org_id ON repositories
FOR EACH ROW
EXECUTE FUNCTION inherit_repository_workspace_id();

-- 3. Backfill any existing repositories where organization has workspace_id
UPDATE repositories r
SET workspace_id = o.workspace_id
FROM organizations o
WHERE r.org_id = o.id 
  AND r.workspace_id IS NULL 
  AND o.workspace_id IS NOT NULL;

-- 4. Update RLS policies for organizations to respect workspace membership
DROP POLICY IF EXISTS organizations_select_policy ON organizations;
CREATE POLICY organizations_select_policy ON organizations
  FOR SELECT
  USING (
    auth.uid() IS NULL OR
    workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM workspace_members wm
      JOIN user_profiles up ON wm.user_id = up.id
      WHERE wm.workspace_id = organizations.workspace_id 
        AND up.user_id = auth.uid()
    )
  );

COMMENT ON COLUMN organizations.workspace_id IS 'Foreign key linking GitHub App installation tenant to a Hopper workspace';

