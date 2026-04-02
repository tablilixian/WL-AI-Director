-- =====================================================
-- WL AI Director - Supabase 数据库初始化脚本
-- 执行方式: Supabase Dashboard → SQL Editor
-- =====================================================

-- =====================================================
-- 1. 创建用户资料表 (扩展 auth.users)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    nickname TEXT,
    avatar_url TEXT,
    api_key TEXT, -- 用户自己的 AI API Key (加密存储)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 2. 项目表
-- =====================================================
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',
    settings JSONB DEFAULT '{}',
    data JSONB, -- 存储完整 ProjectState 数据，用于同步
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 3. 剧本表
-- =====================================================
CREATE TABLE IF NOT EXISTS public.scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    content TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 4. 镜头表
-- =====================================================
CREATE TABLE IF NOT EXISTS public.shots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
    shot_number INTEGER NOT NULL,
    description TEXT,
    camera_movement TEXT,
    start_frame_url TEXT,
    end_frame_url TEXT,
    video_url TEXT,
    video_status TEXT DEFAULT 'pending',
    video_task_id TEXT,
    prompt TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 5. 角色表
-- =====================================================
CREATE TABLE IF NOT EXISTS public.characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    reference_images JSONB DEFAULT '[]',
    variants JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 6. 场景表
-- =====================================================
CREATE TABLE IF NOT EXISTS public.scenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    reference_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 7. 视频生成任务表
-- =====================================================
CREATE TABLE IF NOT EXISTS public.video_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shot_id UUID NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    result_url TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 8. 创建索引
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_scripts_project_id ON scripts(project_id);
CREATE INDEX IF NOT EXISTS idx_shots_script_id ON shots(script_id);
CREATE INDEX IF NOT EXISTS idx_characters_project_id ON characters(project_id);
CREATE INDEX IF NOT EXISTS idx_scenes_project_id ON scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_video_tasks_shot_id ON video_tasks(shot_id);
CREATE INDEX IF NOT EXISTS idx_video_tasks_task_id ON video_tasks(task_id);

-- =====================================================
-- 9. 启用行级安全 (RLS)
-- =====================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_tasks ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 10. RLS 策略
-- =====================================================

-- profiles: 用户只能操作自己的资料
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- projects: 用户只能操作自己的项目
CREATE POLICY "Users can view own projects" ON projects
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects" ON projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON projects
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" ON projects
    FOR DELETE USING (auth.uid() = user_id);

-- scripts: 用户只能操作自己的剧本
CREATE POLICY "Users can view own scripts" ON scripts
    FOR SELECT USING (
        auth.uid() IN (SELECT user_id FROM projects WHERE id = scripts.project_id)
    );

CREATE POLICY "Users can insert own scripts" ON scripts
    FOR INSERT WITH CHECK (
        auth.uid() IN (SELECT user_id FROM projects WHERE id = scripts.project_id)
    );

CREATE POLICY "Users can update own scripts" ON scripts
    FOR UPDATE USING (
        auth.uid() IN (SELECT user_id FROM projects WHERE id = scripts.project_id)
    );

CREATE POLICY "Users can delete own scripts" ON scripts
    FOR DELETE USING (
        auth.uid() IN (SELECT user_id FROM projects WHERE id = scripts.project_id)
    );

-- shots: 用户只能操作自己的镜头
CREATE POLICY "Users can view own shots" ON shots
    FOR SELECT USING (
        auth.uid() IN (
            SELECT p.user_id FROM projects p
            JOIN scripts s ON s.project_id = p.id
            WHERE s.id = shots.script_id
        )
    );

CREATE POLICY "Users can insert own shots" ON shots
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT p.user_id FROM projects p
            JOIN scripts s ON s.project_id = p.id
            WHERE s.id = shots.script_id
        )
    );

CREATE POLICY "Users can update own shots" ON shots
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT p.user_id FROM projects p
            JOIN scripts s ON s.project_id = p.id
            WHERE s.id = shots.script_id
        )
    );

CREATE POLICY "Users can delete own shots" ON shots
    FOR DELETE USING (
        auth.uid() IN (
            SELECT p.user_id FROM projects p
            JOIN scripts s ON s.project_id = p.id
            WHERE s.id = shots.script_id
        )
    );

-- characters: 用户只能操作自己的角色
CREATE POLICY "Users can view own characters" ON characters
    FOR SELECT USING (auth.uid() IN (SELECT user_id FROM projects WHERE id = characters.project_id));

CREATE POLICY "Users can insert own characters" ON characters
    FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM projects WHERE id = characters.project_id));

CREATE POLICY "Users can update own characters" ON characters
    FOR UPDATE USING (auth.uid() IN (SELECT user_id FROM projects WHERE id = characters.project_id));

CREATE POLICY "Users can delete own characters" ON characters
    FOR DELETE USING (auth.uid() IN (SELECT user_id FROM projects WHERE id = characters.project_id));

-- scenes: 用户只能操作自己的场景
CREATE POLICY "Users can view own scenes" ON scenes
    FOR SELECT USING (auth.uid() IN (SELECT user_id FROM projects WHERE id = scenes.project_id));

CREATE POLICY "Users can insert own scenes" ON scenes
    FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM projects WHERE id = scenes.project_id));

CREATE POLICY "Users can update own scenes" ON scenes
    FOR UPDATE USING (auth.uid() IN (SELECT user_id FROM projects WHERE id = scenes.project_id));

CREATE POLICY "Users can delete own scenes" ON scenes
    FOR DELETE USING (auth.uid() IN (SELECT user_id FROM projects WHERE id = scenes.project_id));

-- video_tasks: 用户只能操作自己的任务
CREATE POLICY "Users can view own video_tasks" ON video_tasks
    FOR SELECT USING (
        auth.uid() IN (
            SELECT p.user_id FROM projects p
            JOIN scripts s ON s.project_id = p.id
            JOIN shots sh ON sh.script_id = s.id
            WHERE sh.id = video_tasks.shot_id
        )
    );

CREATE POLICY "Users can insert own video_tasks" ON video_tasks
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT p.user_id FROM projects p
            JOIN scripts s ON s.project_id = p.id
            JOIN shots sh ON sh.script_id = s.id
            WHERE sh.id = video_tasks.shot_id
        )
    );

CREATE POLICY "Users can update own video_tasks" ON video_tasks
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT p.user_id FROM projects p
            JOIN scripts s ON s.project_id = p.id
            JOIN shots sh ON sh.script_id = s.id
            WHERE sh.id = video_tasks.shot_id
        )
    );

-- =====================================================
-- 11. 创建触发器 - 自动创建用户资料
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, nickname)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'nickname');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 12. 创建存储桶
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('avatars', 'avatars', true),
    ('projects', 'projects', true),
    ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 13. 存储策略
-- =====================================================

-- 头像上传
CREATE POLICY "Avatar upload for authenticated users"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'avatars' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Avatar update for authenticated users"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'avatars' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Avatar public read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'avatars');

-- 项目文件上传
CREATE POLICY "Project files upload for authenticated users"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'projects' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Project files update for authenticated users"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'projects' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Project files delete for authenticated users"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'projects' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Project files public read"
    ON storage.objects FOR SELECT USING (bucket_id = 'projects');

-- 视频上传
CREATE POLICY "Videos upload for authenticated users"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'videos' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Videos public read"
    ON storage.objects FOR SELECT USING (bucket_id = 'videos');

-- =====================================================
-- 完成!
-- =====================================================
