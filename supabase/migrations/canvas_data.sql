-- =====================================================
-- WL AI Director - Canvas Data 表迁移脚本
-- 执行方式: Supabase Dashboard → SQL Editor
-- 创建时间: 2024
-- =====================================================

-- =====================================================
-- 1. 创建画布数据表
-- =====================================================
CREATE TABLE IF NOT EXISTS public.canvas_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    layers JSONB NOT NULL DEFAULT '[]',
    canvas_offset JSONB NOT NULL DEFAULT '{"x":0,"y":0}',
    scale FLOAT DEFAULT 1,
    version INT DEFAULT 1,
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT canvas_data_project_unique UNIQUE(project_id)
);

-- =====================================================
-- 2. 创建索引
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_canvas_data_project_id ON canvas_data(project_id);
CREATE INDEX IF NOT EXISTS idx_canvas_data_updated_at ON canvas_data(updated_at);

-- =====================================================
-- 3. 启用行级安全 (RLS)
-- =====================================================
ALTER TABLE canvas_data ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. RLS 策略：用户只能操作自己项目的画布数据
-- =====================================================

-- 查看策略
CREATE POLICY "Users can view own canvas data" ON canvas_data
    FOR SELECT USING (
        auth.uid() IN (SELECT user_id FROM projects WHERE id = canvas_data.project_id)
    );

-- 插入策略
CREATE POLICY "Users can insert own canvas data" ON canvas_data
    FOR INSERT WITH CHECK (
        auth.uid() IN (SELECT user_id FROM projects WHERE id = canvas_data.project_id)
    );

-- 更新策略
CREATE POLICY "Users can update own canvas data" ON canvas_data
    FOR UPDATE USING (
        auth.uid() IN (SELECT user_id FROM projects WHERE id = canvas_data.project_id)
    );

-- 删除策略
CREATE POLICY "Users can delete own canvas data" ON canvas_data
    FOR DELETE USING (
        auth.uid() IN (SELECT user_id FROM projects WHERE id = canvas_data.project_id)
    );

-- =====================================================
-- 5. 创建更新时间触发器
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_canvas_data_updated_at
    BEFORE UPDATE ON canvas_data
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 完成!
-- =====================================================
-- 执行此脚本后，画布数据将可以同步到云端
