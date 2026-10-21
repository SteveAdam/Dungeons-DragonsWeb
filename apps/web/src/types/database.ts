
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "campaign_secrets": {
                  Row: {
                    "campaign_id": string,"invite_code": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"invite_code": string
                  }
                  Update: {
                    "campaign_id"?: string,"invite_code"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "campaign_secrets_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: true
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    }
                  ]
                },"campaigns": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"next_session_at": string | null,"owner_id": string,"rules_edition": string,"settings": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"next_session_at"?: string | null,"owner_id"?: string,"rules_edition"?: string,"settings"?: NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"next_session_at"?: string | null,"owner_id"?: string,"rules_edition"?: string,"settings"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"folders": {
                  Row: {
                    "campaign_id": string,"created_at": string,"id": string,"name": string,"parent_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"id"?: string,"name": string,"parent_id"?: string | null
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"parent_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "folders_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "folders_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "folders"
      referencedColumns: ["id"]
    }
                  ]
                },"links": {
                  Row: {
                    "campaign_id": string,"created_at": string,"from_pin_id": string,"id": string,"label": string,"to_pin_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"from_pin_id": string,"id"?: string,"label"?: string,"to_pin_id": string
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"from_pin_id"?: string,"id"?: string,"label"?: string,"to_pin_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "links_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "links_from_pin_id_fkey"
      columns: ["from_pin_id"]
isOneToOne: false
      referencedRelation: "pins"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "links_to_pin_id_fkey"
      columns: ["to_pin_id"]
isOneToOne: false
      referencedRelation: "pins"
      referencedColumns: ["id"]
    }
                  ]
                },"maps": {
                  Row: {
                    "campaign_id": string,"created_at": string,"fog_mode": string,"height": number,"id": string,"image_path": string,"name": string,"parent_pin_id": string | null,"visible_to_players": boolean,"width": number
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"fog_mode"?: string,"height": number,"id"?: string,"image_path": string,"name": string,"parent_pin_id"?: string | null,"visible_to_players"?: boolean,"width": number
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"fog_mode"?: string,"height"?: number,"id"?: string,"image_path"?: string,"name"?: string,"parent_pin_id"?: string | null,"visible_to_players"?: boolean,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "maps_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "maps_parent_pin_fk"
      columns: ["parent_pin_id"]
isOneToOne: false
      referencedRelation: "pins"
      referencedColumns: ["id"]
    }
                  ]
                },"members": {
                  Row: {
                    "campaign_id": string,"joined_at": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"joined_at"?: string,"role"?: string,"user_id": string
                  }
                  Update: {
                    "campaign_id"?: string,"joined_at"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "members_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    }
                  ]
                },"pages": {
                  Row: {
                    "body": string,"campaign_id": string,"created_at": string,"folder_id": string | null,"id": string,"ingame_date": string | null,"kind": string,"real_date": string | null,"session_no": number | null,"tags": (string)[],"title": string,"updated_at": string,"visible_to_players": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"campaign_id": string,"created_at"?: string,"folder_id"?: string | null,"id"?: string,"ingame_date"?: string | null,"kind"?: string,"real_date"?: string | null,"session_no"?: number | null,"tags"?: (string)[],"title": string,"updated_at"?: string,"visible_to_players"?: boolean
                  }
                  Update: {
                    "body"?: string,"campaign_id"?: string,"created_at"?: string,"folder_id"?: string | null,"id"?: string,"ingame_date"?: string | null,"kind"?: string,"real_date"?: string | null,"session_no"?: number | null,"tags"?: (string)[],"title"?: string,"updated_at"?: string,"visible_to_players"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "pages_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pages_folder_id_fkey"
      columns: ["folder_id"]
isOneToOne: false
      referencedRelation: "folders"
      referencedColumns: ["id"]
    }
                  ]
                },"pin_secrets": {
                  Row: {
                    "dm_notes": string,"pin_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "dm_notes"?: string,"pin_id": string
                  }
                  Update: {
                    "dm_notes"?: string,"pin_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pin_secrets_pin_id_fkey"
      columns: ["pin_id"]
isOneToOne: true
      referencedRelation: "pins"
      referencedColumns: ["id"]
    }
                  ]
                },"pins": {
                  Row: {
                    "color": string,"created_at": string,"description": string,"history": string,"icon": string,"id": string,"map_id": string,"music_url": string | null,"size": number,"tags": (string)[],"title": string,"traits": (string)[],"type": string,"visible_to_players": boolean,"x": number,"y": number
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"description"?: string,"history"?: string,"icon"?: string,"id"?: string,"map_id": string,"music_url"?: string | null,"size"?: number,"tags"?: (string)[],"title": string,"traits"?: (string)[],"type"?: string,"visible_to_players"?: boolean,"x": number,"y": number
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"description"?: string,"history"?: string,"icon"?: string,"id"?: string,"map_id"?: string,"music_url"?: string | null,"size"?: number,"tags"?: (string)[],"title"?: string,"traits"?: (string)[],"type"?: string,"visible_to_players"?: boolean,"x"?: number,"y"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pins_map_id_fkey"
      columns: ["map_id"]
isOneToOne: false
      referencedRelation: "maps"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"discord_id": string | null,"display_name": string | null,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"discord_id"?: string | null,"display_name"?: string | null,"id": string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"discord_id"?: string | null,"display_name"?: string | null,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "can_read_map_image":
{ Args: { "object_name": string }; Returns: boolean
                           },
"folder_campaign":
{ Args: { "object_name": string }; Returns: string
                           },
"is_dm":
{ Args: { "c": string }; Returns: boolean
                           },
"is_member":
{ Args: { "c": string }; Returns: boolean
                           },
"join_campaign":
{ Args: { "code": string }; Returns: string
                           },
"map_campaign":
{ Args: { "m": string }; Returns: string
                           },
"map_is_revealed":
{ Args: { "m": string }; Returns: boolean
                           },
"pin_campaign":
{ Args: { "p": string }; Returns: string
                           },
"pin_is_revealed":
{ Args: { "p": string }; Returns: boolean
                           },
"shares_campaign":
{ Args: { "other": string }; Returns: boolean
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
