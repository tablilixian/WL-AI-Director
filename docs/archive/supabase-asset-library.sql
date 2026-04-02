-- =====================================================
-- 资产库表 SQL 脚本
-- 执行方式: Supabase Dashboard → SQL Editor
-- =====================================================

-- =====================================================
-- 1. 创建资产库表
-- =====================================================
CREATE TABLE IF NOT EXISTS public.asset_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('character', 'scene', 'prop', 'turnaround')),
    name TEXT NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    project_name TEXT,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 2. 创建索引
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_asset_library_user_id ON asset_library(user_id);
CREATE INDEX IF NOT EXISTS idx_asset_library_type ON asset_library(type);
CREATE INDEX IF NOT EXISTS idx_asset_library_project_id ON asset_library(project_id);
CREATE INDEX IF NOT EXISTS idx_asset_library_updated_at ON asset_library(updated_at DESC);

-- =====================================================
-- 3. 启用行级安全 (RLS)
-- =====================================================
ALTER TABLE asset_library ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. RLS 策略
-- =====================================================

-- 用户只能查看自己的资产库
CREATE POLICY "Users can view own asset_library"
    ON asset_library
    FOR SELECT
    USING (auth.uid() = user_id);

-- 用户只能插入自己的资产库（自动设置 user_id）
CREATE POLICY "Users can insert own asset_library"
    ON asset_library
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 用户只能更新自己的资产库
CREATE POLICY "Users can update own asset_library"
    ON asset_library
    FOR UPDATE
    USING (auth.uid() = user_id);

-- 用户只能删除自己的资产库
CREATE POLICY "Users can delete own asset_library"
    ON asset_library
    FOR DELETE
    USING (auth.uid() = user_id);

-- =====================================================
-- 5. 创建触发器 - 自动设置 user_id 和更新 updated_at
-- =====================================================

-- 自动设置 user_id
CREATE OR REPLACE FUNCTION public.set_asset_library_user_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.user_id = auth.uid();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_asset_library_insert
    BEFORE INSERT ON asset_library
    FOR EACH ROW
    EXECUTE FUNCTION public.set_asset_library_user_id();

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION public.update_asset_library_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_asset_library_updated
    BEFORE UPDATE ON asset_library
    FOR EACH ROW
    EXECUTE FUNCTION public.update_asset_library_updated_at();

-- =====================================================
-- 完成!
-- =====================================================
