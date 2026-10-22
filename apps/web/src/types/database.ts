
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
                    "created_at": string,"game_seconds": number,"id": string,"name": string,"next_session_at": string | null,"owner_id": string,"rules_edition": string,"settings": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"game_seconds"?: number,"id"?: string,"name": string,"next_session_at"?: string | null,"owner_id"?: string,"rules_edition"?: string,"settings"?: NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"game_seconds"?: number,"id"?: string,"name"?: string,"next_session_at"?: string | null,"owner_id"?: string,"rules_edition"?: string,"settings"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"characters": {
                  Row: {
                    "campaign_id": string,"conditions": (string)[],"created_at": string,"entity_id": string | null,"exhaustion": number,"id": string,"name": string,"owner_id": string,"sheet": NonNullable<Json>,"xp": number
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"conditions"?: (string)[],"created_at"?: string,"entity_id"?: string | null,"exhaustion"?: number,"id"?: string,"name": string,"owner_id"?: string,"sheet"?: NonNullable<Json>,"xp"?: number
                  }
                  Update: {
                    "campaign_id"?: string,"conditions"?: (string)[],"created_at"?: string,"entity_id"?: string | null,"exhaustion"?: number,"id"?: string,"name"?: string,"owner_id"?: string,"sheet"?: NonNullable<Json>,"xp"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "characters_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "characters_entity_id_fkey"
      columns: ["entity_id"]
isOneToOne: true
      referencedRelation: "entities"
      referencedColumns: ["id"]
    }
                  ]
                },"effect_secrets": {
                  Row: {
                    "effect_id": string,"hidden_detail": string
                  }
                  ComputedFields: never
                  Insert: {
                    "effect_id": string,"hidden_detail"?: string
                  }
                  Update: {
                    "effect_id"?: string,"hidden_detail"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "effect_secrets_effect_id_fkey"
      columns: ["effect_id"]
isOneToOne: true
      referencedRelation: "effects"
      referencedColumns: ["id"]
    }
                  ]
                },"effects": {
                  Row: {
                    "character_id": string,"concentration": boolean,"created_at": string,"duration": NonNullable<Json>,"id": string,"mode": string,"name": string,"source": string,"stat": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "character_id": string,"concentration"?: boolean,"created_at"?: string,"duration"?: NonNullable<Json>,"id"?: string,"mode": string,"name": string,"source"?: string,"stat": string,"value": number
                  }
                  Update: {
                    "character_id"?: string,"concentration"?: boolean,"created_at"?: string,"duration"?: NonNullable<Json>,"id"?: string,"mode"?: string,"name"?: string,"source"?: string,"stat"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "effects_character_id_fkey"
      columns: ["character_id"]
isOneToOne: false
      referencedRelation: "characters"
      referencedColumns: ["id"]
    }
                  ]
                },"entities": {
                  Row: {
                    "campaign_id": string,"created_at": string,"folder_id": string | null,"id": string,"name": string,"sort_order": number,"type": Database["public"]['Enums']["entity_type"],"updated_at": string,"visible_to_players": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"folder_id"?: string | null,"id"?: string,"name": string,"sort_order"?: number,"type": Database["public"]['Enums']["entity_type"],"updated_at"?: string,"visible_to_players"?: boolean
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"folder_id"?: string | null,"id"?: string,"name"?: string,"sort_order"?: number,"type"?: Database["public"]['Enums']["entity_type"],"updated_at"?: string,"visible_to_players"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "entities_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entities_folder_id_fkey"
      columns: ["folder_id"]
isOneToOne: false
      referencedRelation: "entity_folders"
      referencedColumns: ["id"]
    }
                  ]
                },"entity_folders": {
                  Row: {
                    "campaign_id": string,"created_at": string,"id": string,"name": string,"parent_id": string | null,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"id"?: string,"name": string,"parent_id"?: string | null,"sort_order"?: number
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"parent_id"?: string | null,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "entity_folders_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entity_folders_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "entity_folders"
      referencedColumns: ["id"]
    }
                  ]
                },"entity_links": {
                  Row: {
                    "a_id": string,"b_id": string,"campaign_id": string,"created_at": string,"hidden": boolean,"id": string,"label_ab": string,"label_ba": string
                  }
                  ComputedFields: never
                  Insert: {
                    "a_id": string,"b_id": string,"campaign_id": string,"created_at"?: string,"hidden"?: boolean,"id"?: string,"label_ab": string,"label_ba": string
                  }
                  Update: {
                    "a_id"?: string,"b_id"?: string,"campaign_id"?: string,"created_at"?: string,"hidden"?: boolean,"id"?: string,"label_ab"?: string,"label_ba"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entity_links_a_id_fkey"
      columns: ["a_id"]
isOneToOne: false
      referencedRelation: "entities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entity_links_b_id_fkey"
      columns: ["b_id"]
isOneToOne: false
      referencedRelation: "entities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entity_links_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    }
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
                    "campaign_id": string,"created_at": string,"fog_mode": string,"grid_size": number | null,"height": number,"id": string,"image_path": string,"name": string,"north_degrees": number,"parent_pin_id": string | null,"scale_unit": string,"scale_width": number | null,"visible_to_players": boolean,"width": number
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"fog_mode"?: string,"grid_size"?: number | null,"height": number,"id"?: string,"image_path": string,"name": string,"north_degrees"?: number,"parent_pin_id"?: string | null,"scale_unit"?: string,"scale_width"?: number | null,"visible_to_players"?: boolean,"width": number
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"fog_mode"?: string,"grid_size"?: number | null,"height"?: number,"id"?: string,"image_path"?: string,"name"?: string,"north_degrees"?: number,"parent_pin_id"?: string | null,"scale_unit"?: string,"scale_width"?: number | null,"visible_to_players"?: boolean,"width"?: number
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
                    "body": string,"campaign_id": string,"created_at": string,"entity_id": string | null,"folder_id": string | null,"id": string,"ingame_date": string | null,"kind": string,"real_date": string | null,"session_no": number | null,"tags": (string)[],"title": string,"updated_at": string,"visible_to_players": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"campaign_id": string,"created_at"?: string,"entity_id"?: string | null,"folder_id"?: string | null,"id"?: string,"ingame_date"?: string | null,"kind"?: string,"real_date"?: string | null,"session_no"?: number | null,"tags"?: (string)[],"title": string,"updated_at"?: string,"visible_to_players"?: boolean
                  }
                  Update: {
                    "body"?: string,"campaign_id"?: string,"created_at"?: string,"entity_id"?: string | null,"folder_id"?: string | null,"id"?: string,"ingame_date"?: string | null,"kind"?: string,"real_date"?: string | null,"session_no"?: number | null,"tags"?: (string)[],"title"?: string,"updated_at"?: string,"visible_to_players"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "pages_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pages_entity_id_fkey"
      columns: ["entity_id"]
isOneToOne: false
      referencedRelation: "entities"
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
                    "color": string,"created_at": string,"description": string,"entity_id": string | null,"history": string,"icon": string,"id": string,"map_id": string,"music_url": string | null,"size": number,"tags": (string)[],"title": string,"traits": (string)[],"type": string,"visible_to_players": boolean,"x": number,"y": number
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"description"?: string,"entity_id"?: string | null,"history"?: string,"icon"?: string,"id"?: string,"map_id": string,"music_url"?: string | null,"size"?: number,"tags"?: (string)[],"title": string,"traits"?: (string)[],"type"?: string,"visible_to_players"?: boolean,"x": number,"y": number
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"description"?: string,"entity_id"?: string | null,"history"?: string,"icon"?: string,"id"?: string,"map_id"?: string,"music_url"?: string | null,"size"?: number,"tags"?: (string)[],"title"?: string,"traits"?: (string)[],"type"?: string,"visible_to_players"?: boolean,"x"?: number,"y"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pins_entity_id_fkey"
      columns: ["entity_id"]
isOneToOne: false
      referencedRelation: "entities"
      referencedColumns: ["id"]
    },{
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
                },"regions": {
                  Row: {
                    "created_at": string,"cx": number,"cy": number,"description": string,"id": string,"map_id": string,"name": string,"radius": number,"shape": string,"terrain": string,"visible_to_players": boolean,"weather": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"cx": number,"cy": number,"description"?: string,"id"?: string,"map_id": string,"name": string,"radius": number,"shape"?: string,"terrain"?: string,"visible_to_players"?: boolean,"weather"?: string
                  }
                  Update: {
                    "created_at"?: string,"cx"?: number,"cy"?: number,"description"?: string,"id"?: string,"map_id"?: string,"name"?: string,"radius"?: number,"shape"?: string,"terrain"?: string,"visible_to_players"?: boolean,"weather"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "regions_map_id_fkey"
      columns: ["map_id"]
isOneToOne: false
      referencedRelation: "maps"
      referencedColumns: ["id"]
    }
                  ]
                },"rolls": {
                  Row: {
                    "bonus": number,"bonus_breakdown": Json | null,"campaign_id": string,"character_id": string | null,"created_at": string,"crit": boolean,"dice": (number)[],"fumble": boolean,"hidden": boolean,"id": string,"kept": number,"kind": string,"label": string,"mode": string,"rolled_by": string,"success": boolean | null,"target": number | null,"total": number
                  }
                  ComputedFields: never
                  Insert: {
                    "bonus": number,"bonus_breakdown"?: Json | null,"campaign_id": string,"character_id"?: string | null,"created_at"?: string,"crit"?: boolean,"dice": (number)[],"fumble"?: boolean,"hidden"?: boolean,"id"?: string,"kept": number,"kind": string,"label": string,"mode": string,"rolled_by"?: string,"success"?: boolean | null,"target"?: number | null,"total": number
                  }
                  Update: {
                    "bonus"?: number,"bonus_breakdown"?: Json | null,"campaign_id"?: string,"character_id"?: string | null,"created_at"?: string,"crit"?: boolean,"dice"?: (number)[],"fumble"?: boolean,"hidden"?: boolean,"id"?: string,"kept"?: number,"kind"?: string,"label"?: string,"mode"?: string,"rolled_by"?: string,"success"?: boolean | null,"target"?: number | null,"total"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "rolls_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rolls_character_fk"
      columns: ["character_id"]
isOneToOne: false
      referencedRelation: "characters"
      referencedColumns: ["id"]
    }
                  ]
                },"srd_armor": {
                  Row: {
                    "category": string,"data": NonNullable<Json>,"id": string,"name": string,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"data": NonNullable<Json>,"id": string,"name": string,"source": string
                  }
                  Update: {
                    "category"?: string,"data"?: NonNullable<Json>,"id"?: string,"name"?: string,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"srd_backgrounds": {
                  Row: {
                    "data": NonNullable<Json>,"id": string,"name": string,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "data": NonNullable<Json>,"id": string,"name": string,"source": string
                  }
                  Update: {
                    "data"?: NonNullable<Json>,"id"?: string,"name"?: string,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"srd_classes": {
                  Row: {
                    "data": NonNullable<Json>,"id": string,"name": string,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "data": NonNullable<Json>,"id": string,"name": string,"source": string
                  }
                  Update: {
                    "data"?: NonNullable<Json>,"id"?: string,"name"?: string,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"srd_species": {
                  Row: {
                    "data": NonNullable<Json>,"id": string,"name": string,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "data": NonNullable<Json>,"id": string,"name": string,"source": string
                  }
                  Update: {
                    "data"?: NonNullable<Json>,"id"?: string,"name"?: string,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"srd_spells": {
                  Row: {
                    "data": NonNullable<Json>,"id": string,"level": number,"name": string,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "data": NonNullable<Json>,"id": string,"level": number,"name": string,"source": string
                  }
                  Update: {
                    "data"?: NonNullable<Json>,"id"?: string,"level"?: number,"name"?: string,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"srd_weapons": {
                  Row: {
                    "category": string,"data": NonNullable<Json>,"id": string,"kind": string,"name": string,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"data": NonNullable<Json>,"id": string,"kind": string,"name": string,"source": string
                  }
                  Update: {
                    "category"?: string,"data"?: NonNullable<Json>,"id"?: string,"kind"?: string,"name"?: string,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_link":
{ Args: { "p_a": string,"p_b": string,"p_hidden"?: boolean,"p_label_ab": string,"p_label_ba": string }; Returns: {
              "a_id": string,
"b_id": string,
"campaign_id": string,
"created_at": string,
"hidden": boolean,
"id": string,
"label_ab": string,
"label_ba": string
            }
                          SetofOptions: {
        from: "*"
        to: "entity_links"
        isOneToOne: true
        isSetofReturn: false
      } },
"can_read_map_image":
{ Args: { "object_name": string }; Returns: boolean
                           },
"character_campaign":
{ Args: { "c": string }; Returns: string
                           },
"create_entity":
{ Args: { "p_campaign": string,"p_folder"?: string,"p_name": string,"p_type": Database["public"]['Enums']["entity_type"],"p_visible"?: boolean }; Returns: {
              "campaign_id": string,
"created_at": string,
"folder_id": string | null,
"id": string,
"name": string,
"sort_order": number,
"type": Database["public"]['Enums']["entity_type"],
"updated_at": string,
"visible_to_players": boolean
            }
                          SetofOptions: {
        from: "*"
        to: "entities"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_folder":
{ Args: { "p_campaign": string,"p_name": string,"p_parent"?: string }; Returns: {
              "campaign_id": string,
"created_at": string,
"id": string,
"name": string,
"parent_id": string | null,
"sort_order": number
            }
                          SetofOptions: {
        from: "*"
        to: "entity_folders"
        isOneToOne: true
        isSetofReturn: false
      } },
"d20":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"delete_entity":
{ Args: { "p_entity": string }; Returns: undefined
                           },
"delete_folder":
{ Args: { "p_folder": string }; Returns: undefined
                           },
"entity_campaign":
{ Args: { "e": string }; Returns: string
                           },
"entity_folder_campaign":
{ Args: { "f": string }; Returns: string
                           },
"entity_visible":
{ Args: { "e": string }; Returns: boolean
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
"move_entity":
{ Args: { "p_entity": string,"p_folder": string,"p_sort_order"?: number }; Returns: {
              "campaign_id": string,
"created_at": string,
"folder_id": string | null,
"id": string,
"name": string,
"sort_order": number,
"type": Database["public"]['Enums']["entity_type"],
"updated_at": string,
"visible_to_players": boolean
            }
                          SetofOptions: {
        from: "*"
        to: "entities"
        isOneToOne: true
        isSetofReturn: false
      } },
"move_folder":
{ Args: { "p_folder": string,"p_parent": string,"p_sort_order"?: number }; Returns: {
              "campaign_id": string,
"created_at": string,
"id": string,
"name": string,
"parent_id": string | null,
"sort_order": number
            }
                          SetofOptions: {
        from: "*"
        to: "entity_folders"
        isOneToOne: true
        isSetofReturn: false
      } },
"owns_character":
{ Args: { "c": string }; Returns: boolean
                           },
"pin_campaign":
{ Args: { "p": string }; Returns: string
                           },
"pin_is_revealed":
{ Args: { "p": string }; Returns: boolean
                           },
"remove_link":
{ Args: { "p_link": string }; Returns: undefined
                           },
"rename_entity":
{ Args: { "p_entity": string,"p_name": string }; Returns: {
              "campaign_id": string,
"created_at": string,
"folder_id": string | null,
"id": string,
"name": string,
"sort_order": number,
"type": Database["public"]['Enums']["entity_type"],
"updated_at": string,
"visible_to_players": boolean
            }
                          SetofOptions: {
        from: "*"
        to: "entities"
        isOneToOne: true
        isSetofReturn: false
      } },
"rename_folder":
{ Args: { "p_folder": string,"p_name": string }; Returns: {
              "campaign_id": string,
"created_at": string,
"id": string,
"name": string,
"parent_id": string | null,
"sort_order": number
            }
                          SetofOptions: {
        from: "*"
        to: "entity_folders"
        isOneToOne: true
        isSetofReturn: false
      } },
"require_dm":
{ Args: { "c": string }; Returns: undefined
                           },
"reveal_link":
{ Args: { "p_hidden"?: boolean,"p_link": string }; Returns: {
              "a_id": string,
"b_id": string,
"campaign_id": string,
"created_at": string,
"hidden": boolean,
"id": string,
"label_ab": string,
"label_ba": string
            }
                          SetofOptions: {
        from: "*"
        to: "entity_links"
        isOneToOne: true
        isSetofReturn: false
      } },
"roll_d20":
{ Args: { "p_actor": string,"p_bonus": number,"p_breakdown"?: Json,"p_campaign": string,"p_character": string,"p_hidden"?: boolean,"p_kind": string,"p_label": string,"p_mode": string,"p_target": number }; Returns: {
              "bonus": number,
"bonus_breakdown": Json | null,
"campaign_id": string,
"character_id": string | null,
"created_at": string,
"crit": boolean,
"dice": (number)[],
"fumble": boolean,
"hidden": boolean,
"id": string,
"kept": number,
"kind": string,
"label": string,
"mode": string,
"rolled_by": string,
"success": boolean | null,
"target": number | null,
"total": number
            }
                          SetofOptions: {
        from: "*"
        to: "rolls"
        isOneToOne: true
        isSetofReturn: false
      } },
"roll_outcome":
{ Args: { "p_bonus": number,"p_dice": (number)[],"p_kind": string,"p_mode": string,"p_target": number }; Returns: Record<string, unknown>
                           },
"set_entity_visibility":
{ Args: { "p_entity": string,"p_visible": boolean }; Returns: {
              "campaign_id": string,
"created_at": string,
"folder_id": string | null,
"id": string,
"name": string,
"sort_order": number,
"type": Database["public"]['Enums']["entity_type"],
"updated_at": string,
"visible_to_players": boolean
            }
                          SetofOptions: {
        from: "*"
        to: "entities"
        isOneToOne: true
        isSetofReturn: false
      } },
"shares_campaign":
{ Args: { "other": string }; Returns: boolean
                           }
          }
          Enums: {
            "entity_type": "npc"|"location"|"item"|"faction"|"lore"|"player"|"party"|"session"
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
            "entity_type": ["npc", "location", "item", "faction", "lore", "player", "party", "session"]
          }
        }
} as const
