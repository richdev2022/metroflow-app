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
        response.data,
        'Failed to get meetings',
      );
    },
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

// --- Calls ---

export const useCalls = (page = 1, limit = 10) => {
  return useQuery({
    queryKey: ['calls', page, limit],
    queryFn: async () => {
      const response = await api.get('/calls', {
        params: { page, limit },
      });
      return unwrapApiData<{ calls: Call[]; total: number }>(
        response.data,
        'Failed to get calls',
      );
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
    mutationFn: async (callId: string) => {
      const response = await api.post(`/calls/${callId}/join`);
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
