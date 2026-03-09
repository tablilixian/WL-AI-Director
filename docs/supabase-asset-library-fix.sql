-- =====================================================
-- 资产库表 RLS 修复脚本
-- 执行方式: Supabase Dashboard → SQL Editor
-- =====================================================

-- =====================================================
-- 1. 删除旧的触发器（如果存在）
-- =====================================================
DROP TRIGGER IF EXISTS on_asset_library_updated ON asset_library;
DROP TRIGGER IF EXISTS on_asset_library_insert ON asset_library;

-- =====================================================
-- 2. 删除旧的函数（如果存在）
-- =====================================================
DROP FUNCTION IF EXISTS public.update_asset_library_updated_at();
DROP FUNCTION IF EXISTS public.set_asset_library_user_id();

-- =====================================================
-- 3. 重新创建触发器 - 自动设置 user_id 和更新 updated_at
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
-- 4. 验证触发器是否创建成功
-- =====================================================
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'asset_library';

-- =====================================================
-- 完成!
-- =====================================================
