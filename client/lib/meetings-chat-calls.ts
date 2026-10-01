import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';
import { unwrapApiData } from './api-response';
import type {
  Meeting,
  CreateMeetingInput,
  UpdateMeetingInput,
  Conversation,
  CreateConversationInput,
  Message,
  SendMessageInput,
  Call,
  CreateCallInput,
  UpdateCallInput,
  Recording,
  CreateRecordingInput,
  UpdateRecordingInput,
  ValidateCallResponse,
  ValidateMeetingResponse,
  ChatGifsResult,
} from '@shared/api';

// --- Meetings ---

export const useMeetings = (page = 1, limit = 10) => {
  return useQuery({
    queryKey: ['meetings', page, limit],
    queryFn: async () => {
      const response = await api.get('/meetings', {
        params: { page, limit },
      });
      return unwrapApiData<{ meetings: Meeting[]; total: number }>(
        response.data, 'Failed to get meetings');
    },
  });
};

/** Meetings inside a date window (Calendar month view). */
export const useMeetingsRange = (from: string, to: string) => {
  return useQuery({
    queryKey: ['meetings-range', from, to],
    queryFn: async () => {
      const response = await api.get('/meetings', {
        params: { page: 1, limit: 200, from, to },
      });
      return unwrapApiData<{ meetings: Meeting[]; total: number }>(
        response.data, 'Failed to get meetings');
    },
    enabled: !!from && !!to,
  });
};

export const useMeeting = (meetingId: string) => {
  return useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: async () => {
      const response = await api.get(`/meetings/${meetingId}`);
      return unwrapApiData<Meeting>(response.data, 'Failed to get meeting');
    },
    enabled: !!meetingId,
  });
};

export const useMeetingByCode = (code: string) => {
  return useQuery({
    queryKey: ['meeting-by-code', code],
    queryFn: async () => {
      const response = await api.get(`/meetings/code/${code}`);
      return unwrapApiData<Meeting>(response.data, 'Failed to get meeting');
    },
    enabled: !!code,
  });
};

export const useValidateMeetingCode = (code: string, opts?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['validate-meeting-code', code],
    queryFn: async () => {
      const response = await api.get(`/meetings/validate/${code}`);
      return unwrapApiData<ValidateMeetingResponse>(
        response.data,
        'Failed to validate meeting code'
      );
    },
    enabled: !!code && (opts?.enabled ?? true),
  });
};

export const useCreateMeeting = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateMeetingInput) => {
      const response = await api.post('/meetings', data);
      return unwrapApiData<Meeting>(response.data, 'Failed to create meeting');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });
};

export const useUpdateMeeting = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ meetingId, data }: { meetingId: string; data: UpdateMeetingInput }) => {
      const response = await api.put(`/meetings/${meetingId}`, data);
      return unwrapApiData<Meeting>(response.data, 'Failed to update meeting');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting', variables.meetingId] });
    },
  });
};

export const useDeleteMeeting = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (meetingId: string) => {
      const response = await api.delete(`/meetings/${meetingId}`);
      unwrapApiData(response.data, 'Failed to delete meeting');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });
};

export const useJoinMeeting = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ meetingId, password }: { meetingId: string; password?: string }) => {
      const response = await api.post(`/meetings/${meetingId}/join`, { password });
      return unwrapApiData<Meeting>(response.data, 'Failed to join meeting');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting', variables.meetingId] });
    },
  });
};

export const useLeaveMeeting = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (meetingId: string) => {
      const response = await api.post(`/meetings/${meetingId}/leave`);
      return unwrapApiData<Meeting>(response.data, 'Failed to leave meeting');
    },
    onSuccess: (_, meetingId) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] });
    },
  });
};

// --- Chat ---

export const useConversations = () => {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const response = await api.get('/chat/conversations');
      return unwrapApiData<Conversation[]>(response.data, 'Failed to get conversations');
    },
  });
};

export const useCreateConversation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateConversationInput) => {
      const response = await api.post('/chat/conversations', data);
      return unwrapApiData<Conversation>(response.data, 'Failed to create conversation');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
};

export const useMessages = (conversationId: string, page = 1, limit = 50) => {
  return useQuery({
    queryKey: ['messages', conversationId, page, limit],
    queryFn: async () => {
      const response = await api.get(`/chat/conversations/${conversationId}/messages`, {
        params: { page, limit },
      });
      return unwrapApiData<{ messages: Message[]; total: number }>(
        response.data,
        'Failed to get messages',
      );
    },
    enabled: !!conversationId,
  });
};

export const useSendMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, data }: { conversationId: string; data: SendMessageInput }) => {
      const response = await api.post(`/chat/conversations/${conversationId}/messages`, data);
      return unwrapApiData<Message>(response.data, 'Failed to send message');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
};

export interface ChatMediaUploadResult {
  url: string;
  /** Original file name reported by the backend. */
  name?: string;
  /** Storage-driver filename (may differ from `name`). */
  filename?: string;
  mimeType: string;
  size: number;
  /** image | video | audio | document | gif */
  attachmentType: string;
}

/**
 * Upload a chat media file (voice-note audio, photos, videos, documents…) to
 * POST /chat/media. Multipart field name must be `file`; the backend accepts
 * images/videos/audio/docs/GIFs up to 100MB and returns
 * { url, name, filename, mimeType, size, attachmentType }.
 * The returned object feeds straight into useSendMessage as
 * { attachmentUrl: url, attachmentType, attachmentName, attachmentSize, messageType }.
 */
export const uploadChatMedia = async (file: File): Promise<ChatMediaUploadResult> => {
  const formData = new FormData();
  formData.append('file', file);
  // Axios detects FormData and sets the multipart boundary header itself.
  const response = await api.post('/chat/media', formData);
  return unwrapApiData<ChatMediaUploadResult>(response.data, 'Failed to upload media');
};

/**
 * Tenor GIF proxy — GET /chat/gifs?search=<query|'trending'>&limit=16.
 * Returns { configured: false } when the server has no TENOR_API_KEY;
 * callers must hide the GIF tab in that case.
 */
export const getChatGifs = async (search?: string, limit = 16): Promise<ChatGifsResult> => {
  const response = await api.get('/chat/gifs', {
    params: { search: search?.trim() ? search.trim() : 'trending', limit },
  });
  return unwrapApiData<ChatGifsResult>(response.data, 'Failed to load GIFs');
};

// --- Calls ---

export const useCalls = (page = 1, limit = 10) => {
  return useQuery({
    queryKey: ['calls', page, limit],
    queryFn: async () => {
      const response = await api.get('/calls', {
        params: { page, limit },
      });
      return unwrapApiData<{ calls: Call[]; total: number }>(
        response.data, 'Failed to get calls');
    },
  });
};

export const useCall = (callId: string) => {
  return useQuery({
    queryKey: ['call', callId],
    queryFn: async () => {
      const response = await api.get(`/calls/${callId}`);
      return unwrapApiData<Call>(response.data, 'Failed to get call');
    },
    enabled: !!callId,
  });
};

export const useCallByCode = (code: string) => {
  return useQuery({
    queryKey: ['call-by-code', code],
    queryFn: async () => {
      const response = await api.get(`/calls/code/${code}`);
      return unwrapApiData<Call>(response.data, 'Failed to get call');
    },
    enabled: !!code,
  });
};

export const useValidateCallCode = (code: string, opts?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['validate-call-code', code],
    queryFn: async () => {
      const response = await api.get(`/calls/validate/${code}`);
      return unwrapApiData<ValidateCallResponse>(
        response.data,
        'Failed to validate call code'
      );
    },
    enabled: !!code && (opts?.enabled ?? true),
  });
};

export const useCreateCall = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateCallInput) => {
      const response = await api.post('/calls', data);
      return unwrapApiData<Call>(response.data, 'Failed to create call');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
  });
};

export const useUpdateCall = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ callId, data }: { callId: string; data: UpdateCallInput }) => {
      const response = await api.put(`/calls/${callId}`, data);
      return unwrapApiData<Call>(response.data, 'Failed to update call');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
      queryClient.invalidateQueries({ queryKey: ['call', variables.callId] });
    },
  });
};

export const useJoinCall = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ callId, password }: { callId: string; password?: string }) => {
      const response = await api.post(`/calls/${callId}/join`, { password });
      return unwrapApiData<Call>(response.data, 'Failed to join call');
    },
    onSuccess: (_, callId) => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
      queryClient.invalidateQueries({ queryKey: ['call', callId] });
    },
  });
};

export const useLeaveCall = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (callId: string) => {
      const response = await api.post(`/calls/${callId}/leave`);
      return unwrapApiData<Call>(response.data, 'Failed to leave call');
    },
    onSuccess: (_, callId) => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
      queryClient.invalidateQueries({ queryKey: ['call', callId] });
    },
  });
};

export const useDeleteCall = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (callId: string) => {
      const response = await api.delete(`/calls/${callId}`);
      unwrapApiData(response.data, 'Failed to delete call');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    },
  });
};

// --- Recordings ---

export const useRecordings = (page = 1, limit = 10) => {
  return useQuery({
    queryKey: ['recordings', page, limit],
    queryFn: async () => {
      const response = await api.get('/recordings', {
        params: { page, limit },
      });
      return unwrapApiData<{ recordings: Recording[]; total: number }>(
        response.data, 'Failed to get recordings');
    },
  });
};

export const useRecording = (recordingId: string) => {
  return useQuery({
    queryKey: ['recording', recordingId],
    queryFn: async () => {
      const response = await api.get(`/recordings/${recordingId}`);
      return unwrapApiData<Recording>(response.data, 'Failed to get recording');
    },
    enabled: !!recordingId,
  });
};

export const useCreateRecording = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateRecordingInput) => {
      const response = await api.post('/recordings', data);
      return unwrapApiData<Recording>(response.data, 'Failed to create recording');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recordings'] });
    },
  });
};

export const useUpdateRecording = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ recordingId, data }: { recordingId: string; data: UpdateRecordingInput }) => {
      const response = await api.put(`/recordings/${recordingId}`, data);
      return unwrapApiData<Recording>(response.data, 'Failed to update recording');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['recordings'] });
      queryClient.invalidateQueries({ queryKey: ['recording', variables.recordingId] });
    },
  });
};

export const useDeleteRecording = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recordingId: string) => {
      const response = await api.delete(`/recordings/${recordingId}`);
      unwrapApiData(response.data, 'Failed to delete recording');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recordings'] });
    },
  });
};

// --- Guest access (public endpoints; no auth required) ---

export interface GuestMeetingInfo {
  meeting: {
    id: string;
    title: string;
    meetingCode: string;
    status: string;
    startTime: string;
    endTime: string;
    hostName: string;
    waitingRoomEnabled: boolean;
    recordingEnabled: boolean;
    screenSharingEnabled: boolean;
    hasPassword: boolean;
  };
  accessState?: string;
  reasons?: string[];
}

export interface GuestJoinResult {
  meeting: GuestMeetingInfo['meeting'];
  guestToken: string;
  guestId: string;
  guestName: string;
  roomId: string;
  socketRoom: string;
  expiresAt: string;
}

export const guestValidateMeeting = async (code: string, inviteToken?: string) => {
  const response = await api.get(`/meetings/guest/validate/${code}`, {
    params: inviteToken ? { token: inviteToken } : undefined,
  });
  return unwrapApiData<GuestMeetingInfo>(response.data, 'Failed to validate meeting link');
};

export const guestJoinMeeting = async (code: string, name: string, password?: string) => {
  const response = await api.post(`/meetings/guest/${code}/join`, { name, password });
  return unwrapApiData<GuestJoinResult>(response.data, 'Failed to join meeting as guest');
};

export interface GuestCallInfo {
  call: {
    id: string;
    type: string;
    callCode: string;
    status: string;
    hostName: string;
    waitingRoomEnabled: boolean;
    recordingEnabled: boolean;
    isGroupCall: boolean;
    hasPassword: boolean;
  };
  accessState?: string;
  reasons?: string[];
}

export interface GuestCallJoinResult {
  call: GuestCallInfo['call'];
  guestToken: string;
  guestId: string;
  guestName: string;
  roomId: string;
  socketRoom: string;
  expiresAt: string;
}

export const guestValidateCall = async (code: string, inviteToken?: string) => {
  const response = await api.get(`/calls/guest/validate/${code}`, {
    params: inviteToken ? { token: inviteToken } : undefined,
  });
  return unwrapApiData<GuestCallInfo>(response.data, 'Failed to validate call link');
};

export const guestJoinCall = async (code: string, name: string, password?: string) => {
  const response = await api.post(`/calls/guest/${code}/join`, { name, password });
  return unwrapApiData<GuestCallJoinResult>(response.data, 'Failed to join call as guest');
};
