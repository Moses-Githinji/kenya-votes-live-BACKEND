-- Performance Optimization Indexes for Kenya Votes Live
-- This migration adds critical indexes for high-traffic election monitoring

-- Indexes for Vote queries (most frequent)
CREATE INDEX IF NOT EXISTS "idx_votes_position_region" ON "votes" ("position", "regionId");
CREATE INDEX IF NOT EXISTS "idx_votes_position_candidate" ON "votes" ("position", "candidateId");
CREATE INDEX IF NOT EXISTS "idx_votes_region_position" ON "votes" ("regionId", "position");
CREATE INDEX IF NOT EXISTS "idx_votes_created_at" ON "votes" ("createdAt");

-- Indexes for Candidate queries
CREATE INDEX IF NOT EXISTS "idx_candidates_position" ON "candidates" ("position");
CREATE INDEX IF NOT EXISTS "idx_candidates_region" ON "candidates" ("regionId");
CREATE INDEX IF NOT EXISTS "idx_candidates_position_region" ON "candidates" ("position", "regionId");
CREATE INDEX IF NOT EXISTS "idx_candidates_name" ON "candidates" ("name");

-- Indexes for Region queries
CREATE INDEX IF NOT EXISTS "idx_regions_type" ON "regions" ("type");
CREATE INDEX IF NOT EXISTS "idx_regions_code" ON "regions" ("code");
CREATE INDEX IF NOT EXISTS "idx_regions_parent" ON "regions" ("parentId");

-- Indexes for Election Status queries
CREATE INDEX IF NOT EXISTS "idx_election_status_position" ON "election_status" ("position");
CREATE INDEX IF NOT EXISTS "idx_election_status_region" ON "election_status" ("regionId");
CREATE INDEX IF NOT EXISTS "idx_election_status_updated" ON "election_status" ("updatedAt");

-- Indexes for Feedback queries
CREATE INDEX IF NOT EXISTS "idx_feedback_type" ON "feedback" ("type");
CREATE INDEX IF NOT EXISTS "idx_feedback_status" ON "feedback" ("status");
CREATE INDEX IF NOT EXISTS "idx_feedback_created" ON "feedback" ("createdAt");

-- Composite indexes for complex queries
CREATE INDEX IF NOT EXISTS "idx_votes_complex_query" ON "votes" ("position", "regionId", "candidateId");
CREATE INDEX IF NOT EXISTS "idx_candidates_complex_query" ON "candidates" ("position", "regionId", "name");

-- Partial indexes for active data
CREATE INDEX IF NOT EXISTS "idx_votes_active" ON "votes" ("position", "regionId") WHERE "count" > 0;
CREATE INDEX IF NOT EXISTS "idx_candidates_active" ON "candidates" ("position") WHERE "isActive" = true;

-- Indexes for aggregation queries
CREATE INDEX IF NOT EXISTS "idx_votes_aggregation" ON "votes" ("position", "regionId", "count");

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS "idx_candidates_name_search" ON "candidates" USING gin(to_tsvector('english', "name"));
CREATE INDEX IF NOT EXISTS "idx_regions_name_search" ON "regions" USING gin(to_tsvector('english', "name"));

-- Indexes for foreign key relationships
CREATE INDEX IF NOT EXISTS "idx_votes_candidate_fk" ON "votes" ("candidateId");
CREATE INDEX IF NOT EXISTS "idx_votes_region_fk" ON "votes" ("regionId");
CREATE INDEX IF NOT EXISTS "idx_candidates_region_fk" ON "candidates" ("regionId");

-- Performance monitoring indexes
CREATE INDEX IF NOT EXISTS "idx_audit_logs_timestamp" ON "audit_logs" ("timestamp");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_action" ON "audit_logs" ("action");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_user" ON "audit_logs" ("userId");

-- Statistics and analytics indexes
CREATE INDEX IF NOT EXISTS "idx_votes_stats" ON "votes" ("position", "regionId", "count", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_election_status_stats" ON "election_status" ("position", "status", "updatedAt");

-- Comment explaining the indexes
COMMENT ON INDEX "idx_votes_position_region" IS 'Optimizes queries for vote counts by position and region';
COMMENT ON INDEX "idx_candidates_position" IS 'Optimizes candidate lookups by position';
COMMENT ON INDEX "idx_regions_type" IS 'Optimizes region queries by type (county, constituency, ward)';
COMMENT ON INDEX "idx_votes_complex_query" IS 'Optimizes complex vote aggregation queries';
COMMENT ON INDEX "idx_candidates_name_search" IS 'Enables full-text search on candidate names'; 