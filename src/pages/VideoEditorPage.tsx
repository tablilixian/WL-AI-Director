import React from 'react';

interface VideoEditorPageProps {
  projectId?: string;
}

const VideoEditorPage: React.FC<VideoEditorPageProps> = ({ projectId }) => {
  return (
    <div className="flex-1 h-full overflow-hidden">
      <iframe
        src="/video-editor"
        className="w-full h-full border-0"
        title="Video Editor"
      />
    </div>
  );
};

export default VideoEditorPage;