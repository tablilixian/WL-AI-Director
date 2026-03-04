import { supabase } from './supabase'

const VERCEL_FUNCTION_URL = import.meta.env.VITE_VERCEL_FUNCTION_URL || ''

type GenerateVideoRequest = {
  shotId: string
  model: string
  prompt: string
  startFrameUrl?: string
  endFrameUrl?: string
  [key: string]: unknown
}


interface VideoStatusResponse {
  shotId: string
  status: string
  videoUrl: string | null
  taskId: string | null
}

// 获取当前用户的访问令牌
const getAccessToken = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Not authenticated')
  }
  return session.access_token
}

// 调用 Edge Function
const callEdgeFunction = async (
  functionName: string, 
  body?: Record<string, unknown>
): Promise<Response> => {
  const accessToken = await getAccessToken()
  
  const response = await fetch(
    `${VERCEL_FUNCTION_URL}/functions/v1/${functionName}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: body ? JSON.stringify(body) : undefined
    }
  )
  
  return response
}

// =====================================================
// Video Generation API
// =====================================================

export const videoApi = {
  // 生成视频
  generate: async (request: GenerateVideoRequest): Promise<{ taskId: string }> => {
    const response = await callEdgeFunction('generate-video', request)
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to generate video')
    }
    
    const data = await response.json()
    return { taskId: data.taskId }
  },

  // 获取视频生成状态
  getStatus: async (shotId: string): Promise<VideoStatusResponse> => {
    const accessToken = await getAccessToken()
    
    const response = await fetch(
      `${VERCEL_FUNCTION_URL}/functions/v1/get-video-status?shotId=${shotId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to get video status')
    }
    
    return response.json()
  },

  // 轮询等待视频生成完成
  waitForCompletion: async (
    shotId: string,
    onStatusChange?: (status: string) => void,
    maxAttempts: number = 120,
    interval: number = 3000
  ): Promise<string> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await videoApi.getStatus(shotId)
      
      onStatusChange?.(status.status)
      
      if (status.status === 'completed') {
        return status.videoUrl!
      }
      
      if (status.status === 'failed') {
        throw new Error('Video generation failed')
      }
      
      await new Promise(resolve => setTimeout(resolve, interval))
    }
    
    throw new Error('Video generation timeout')
  }
}

// =====================================================
// AI Image Generation API (可选)
// =====================================================

export const imageApi = {
  // 生成图片 (可扩展)
  generate: async (prompt: string, options?: {
    model?: string
    aspectRatio?: string
  }) => {
    // TODO: 实现图片生成 Edge Function
    throw new Error('Not implemented yet')
  }
}
