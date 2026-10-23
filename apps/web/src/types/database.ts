
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ability_roll_uses": {
                  Row: {
                    "campaign_id": string,"character_id": string | null,"roll_id": string,"used_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"character_id"?: string | null,"roll_id": string,"used_at"?: string
                  }
                  Update: {
                    "campaign_id"?: string,"character_id"?: string | null,"roll_id"?: string,"used_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ability_roll_uses_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ability_roll_uses_character_id_fkey"
      columns: ["character_id"]
isOneToOne: false
      referencedRelation: "characters"
      referencedColumns: ["id"]
    }
                  ]
                },"campaign_secrets": {
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
                },"character_details": {
                  Row: {
                    "campaign_id": string,"character_id": string,"data": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"character_id": string,"data"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "campaign_id"?: string,"character_id"?: string,"data"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "character_details_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "character_details_character_id_fkey"
      columns: ["character_id"]
isOneToOne: true
      referencedRelation: "characters"
      referencedColumns: ["id"]
    }
                  ]
                },"character_drafts": {
                  Row: {
                    "campaign_id": string,"data": NonNullable<Json>,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"data"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "campaign_id"?: string,"data"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "character_drafts_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    }
                  ]
                },"character_spell_state": {
                  Row: {
                    "campaign_id": string,"character_id": string,"concentration": Json | null,"prepare_open": boolean,"slots_used": (number)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"character_id": string,"concentration"?: Json | null,"prepare_open"?: boolean,"slots_used"?: (number)[],"updated_at"?: string
                  }
                  Update: {
                    "campaign_id"?: string,"character_id"?: string,"concentration"?: Json | null,"prepare_open"?: boolean,"slots_used"?: (number)[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "character_spell_state_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "character_spell_state_character_id_fkey"
      columns: ["character_id"]
isOneToOne: true
      referencedRelation: "characters"
      referencedColumns: ["id"]
    }
                  ]
                },"characters": {
                  Row: {
                    "campaign_id": string,"conditions": (string)[],"created_at": string,"entity_id": string | null,"exhaustion": number,"id": string,"level_applied": number,"name": string,"owner_id": string,"sheet": NonNullable<Json>,"xp": number
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"conditions"?: (string)[],"created_at"?: string,"entity_id"?: string | null,"exhaustion"?: number,"id"?: string,"level_applied"?: number,"name": string,"owner_id"?: string,"sheet"?: NonNullable<Json>,"xp"?: number
                  }
                  Update: {
                    "campaign_id"?: string,"conditions"?: (string)[],"created_at"?: string,"entity_id"?: string | null,"exhaustion"?: number,"id"?: string,"level_applied"?: number,"name"?: string,"owner_id"?: string,"sheet"?: NonNullable<Json>,"xp"?: number
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
                },"game_clock_events": {
                  Row: {
                    "campaign_id": string,"created_at": string,"created_by": string | null,"from_seconds": number,"id": string,"reason": string,"to_seconds": number
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"created_by"?: string | null,"from_seconds": number,"id"?: string,"reason"?: string,"to_seconds": number
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"created_by"?: string | null,"from_seconds"?: number,"id"?: string,"reason"?: string,"to_seconds"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_clock_events_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    }
                  ]
                },"item_secrets": {
                  Row: {
                    "dm_notes": string,"hidden_effect": string,"item_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "dm_notes"?: string,"hidden_effect"?: string,"item_id": string
                  }
                  Update: {
                    "dm_notes"?: string,"hidden_effect"?: string,"item_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_secrets_item_id_fkey"
      columns: ["item_id"]
isOneToOne: true
      referencedRelation: "items"
      referencedColumns: ["entity_id"]
    }
                  ]
                },"item_transfers": {
                  Row: {
                    "campaign_id": string,"created_at": string,"created_by": string | null,"from_id": string | null,"from_name": string,"from_type": string,"id": string,"item_id": string | null,"item_name": string,"quantity": number,"resolved_at": string | null,"seq": number,"status": string,"to_id": string | null,"to_name": string,"to_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"created_at"?: string,"created_by"?: string | null,"from_id"?: string | null,"from_name": string,"from_type": string,"id"?: string,"item_id"?: string | null,"item_name": string,"quantity": number,"resolved_at"?: string | null,"seq"?: never,"status"?: string,"to_id"?: string | null,"to_name": string,"to_type": string
                  }
                  Update: {
                    "campaign_id"?: string,"created_at"?: string,"created_by"?: string | null,"from_id"?: string | null,"from_name"?: string,"from_type"?: string,"id"?: string,"item_id"?: string | null,"item_name"?: string,"quantity"?: number,"resolved_at"?: string | null,"seq"?: never,"status"?: string,"to_id"?: string | null,"to_name"?: string,"to_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_transfers_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_transfers_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["entity_id"]
    }
                  ]
                },"items": {
                  Row: {
                    "attuned": boolean,"bound": boolean,"campaign_id": string,"created_at": string,"definition": NonNullable<Json>,"entity_id": string,"equipped": boolean,"kind": string,"owner_id": string | null,"owner_type": string,"quantity": number,"rarity": string | null,"requires_attunement": boolean,"srd_ref": string | null,"value_cp": number,"weight": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attuned"?: boolean,"bound"?: boolean,"campaign_id": string,"created_at"?: string,"definition"?: NonNullable<Json>,"entity_id": string,"equipped"?: boolean,"kind": string,"owner_id"?: string | null,"owner_type": string,"quantity"?: number,"rarity"?: string | null,"requires_attunement"?: boolean,"srd_ref"?: string | null,"value_cp"?: number,"weight"?: number | null
                  }
                  Update: {
                    "attuned"?: boolean,"bound"?: boolean,"campaign_id"?: string,"created_at"?: string,"definition"?: NonNullable<Json>,"entity_id"?: string,"equipped"?: boolean,"kind"?: string,"owner_id"?: string | null,"owner_type"?: string,"quantity"?: number,"rarity"?: string | null,"requires_attunement"?: boolean,"srd_ref"?: string | null,"value_cp"?: number,"weight"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_entity_id_fkey"
      columns: ["entity_id"]
isOneToOne: true
      referencedRelation: "entities"
      referencedColumns: ["id"]
    }
                  ]
                },"ledger": {
                  Row: {
                    "amount": NonNullable<Json>,"campaign_id": string,"created_at": string,"created_by": string | null,"id": string,"kind": string,"note": string,"seq": number,"source": string,"target_id": string,"target_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": NonNullable<Json>,"campaign_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind": string,"note"?: string,"seq"?: never,"source": string,"target_id": string,"target_type": string
                  }
                  Update: {
                    "amount"?: NonNullable<Json>,"campaign_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"note"?: string,"seq"?: never,"source"?: string,"target_id"?: string,"target_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    }
                  ]
                },"level_up_events": {
                  Row: {
                    "campaign_id": string,"character_id": string,"choices": NonNullable<Json>,"created_at": string,"created_by": string | null,"from_level": number,"hp_gain": number,"id": string,"roll_id": string | null,"to_level": number
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"character_id": string,"choices": NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"from_level": number,"hp_gain": number,"id"?: string,"roll_id"?: string | null,"to_level": number
                  }
                  Update: {
                    "campaign_id"?: string,"character_id"?: string,"choices"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"from_level"?: number,"hp_gain"?: number,"id"?: string,"roll_id"?: string | null,"to_level"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "level_up_events_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
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
                },"parties": {
                  Row: {
                    "campaign_id": string,"entity_id": string,"is_official": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"entity_id": string,"is_official"?: boolean
                  }
                  Update: {
                    "campaign_id"?: string,"entity_id"?: string,"is_official"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "parties_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "parties_entity_id_fkey"
      columns: ["entity_id"]
isOneToOne: true
      referencedRelation: "entities"
      referencedColumns: ["id"]
    }
                  ]
                },"party_members": {
                  Row: {
                    "character_id": string,"joined_at": string,"party_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "character_id": string,"joined_at"?: string,"party_id": string
                  }
                  Update: {
                    "character_id"?: string,"joined_at"?: string,"party_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "party_members_character_id_fkey"
      columns: ["character_id"]
isOneToOne: false
      referencedRelation: "characters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "party_members_party_id_fkey"
      columns: ["party_id"]
isOneToOne: false
      referencedRelation: "parties"
      referencedColumns: ["entity_id"]
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
                },"rest_events": {
                  Row: {
                    "campaign_id": string,"character_id": string,"created_at": string,"created_by": string | null,"details": NonNullable<Json>,"id": string,"kind": string
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"character_id": string,"created_at"?: string,"created_by"?: string | null,"details"?: NonNullable<Json>,"id"?: string,"kind": string
                  }
                  Update: {
                    "campaign_id"?: string,"character_id"?: string,"created_at"?: string,"created_by"?: string | null,"details"?: NonNullable<Json>,"id"?: string,"kind"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rest_events_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
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
                },"spell_casts": {
                  Row: {
                    "campaign_id": string,"character_id": string,"concentration": boolean,"created_at": string,"created_by": string | null,"ended_concentration": string | null,"id": string,"ritual": boolean,"seq": number,"slot_level": number | null,"spell": string,"spell_level": number
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"character_id": string,"concentration"?: boolean,"created_at"?: string,"created_by"?: string | null,"ended_concentration"?: string | null,"id"?: string,"ritual"?: boolean,"seq"?: never,"slot_level"?: number | null,"spell": string,"spell_level": number
                  }
                  Update: {
                    "campaign_id"?: string,"character_id"?: string,"concentration"?: boolean,"created_at"?: string,"created_by"?: string | null,"ended_concentration"?: string | null,"id"?: string,"ritual"?: boolean,"seq"?: never,"slot_level"?: number | null,"spell"?: string,"spell_level"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "spell_casts_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
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
                },"wallets": {
                  Row: {
                    "campaign_id": string,"cp": number,"gp": number,"id": string,"owner_id": string,"owner_type": string,"pp": number,"sp": number
                  }
                  ComputedFields: never
                  Insert: {
                    "campaign_id": string,"cp"?: number,"gp"?: number,"id"?: string,"owner_id": string,"owner_type": string,"pp"?: number,"sp"?: number
                  }
                  Update: {
                    "campaign_id"?: string,"cp"?: number,"gp"?: number,"id"?: string,"owner_id"?: string,"owner_type"?: string,"pp"?: number,"sp"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "wallets_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "campaigns"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_transfer":
{ Args: { "p_transfer": string }; Returns: string
                           },
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
"advance_clock":
{ Args: { "p_campaign": string,"p_reason"?: string,"p_seconds": number }; Returns: number
                           },
"apply_effect":
{ Args: { "p_character": string,"p_concentration"?: boolean,"p_duration": Json,"p_hidden_detail"?: string,"p_mode": string,"p_name": string,"p_source": string,"p_stat": string,"p_value": number }; Returns: {
              "character_id": string,
"concentration": boolean,
"created_at": string,
"duration": NonNullable<Json>,
"id": string,
"mode": string,
"name": string,
"source": string,
"stat": string,
"value": number
            }
                          SetofOptions: {
        from: "*"
        to: "effects"
        isOneToOne: true
        isSetofReturn: false
      } },
"apply_level_up_from_function":
{ Args: { "p_actor": string,"p_character": string,"p_choices": Json,"p_from": number,"p_hp_gain": number,"p_roll"?: string,"p_sheet": Json }; Returns: {
              "campaign_id": string,
"character_id": string,
"choices": NonNullable<Json>,
"created_at": string,
"created_by": string | null,
"from_level": number,
"hp_gain": number,
"id": string,
"roll_id": string | null,
"to_level": number
            }
                          SetofOptions: {
        from: "*"
        to: "level_up_events"
        isOneToOne: true
        isSetofReturn: false
      } },
"attune_item":
{ Args: { "p_item": string }; Returns: {
              "attuned": boolean,
"bound": boolean,
"campaign_id": string,
"created_at": string,
"definition": NonNullable<Json>,
"entity_id": string,
"equipped": boolean,
"kind": string,
"owner_id": string | null,
"owner_type": string,
"quantity": number,
"rarity": string | null,
"requires_attunement": boolean,
"srd_ref": string | null,
"value_cp": number,
"weight": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } },
"award_coins":
{ Args: { "p_coins": Json,"p_note"?: string,"p_source"?: string,"p_target_id": string,"p_target_type": string }; Returns: undefined
                           },
"award_xp":
{ Args: { "p_amount": number,"p_note"?: string,"p_source": string,"p_target_id": string,"p_target_type": string }; Returns: undefined
                           },
"body_armor":
{ Args: { "d": Json }; Returns: boolean
                           },
"break_concentration":
{ Args: { "p_character": string }; Returns: {
              "campaign_id": string,
"character_id": string,
"concentration": Json | null,
"prepare_open": boolean,
"slots_used": (number)[],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "character_spell_state"
        isOneToOne: true
        isSetofReturn: false
      } },
"can_read_item":
{ Args: { "i": string }; Returns: boolean
                           },
"can_read_map_image":
{ Args: { "object_name": string }; Returns: boolean
                           },
"cancel_transfer":
{ Args: { "p_transfer": string }; Returns: undefined
                           },
"cast_spell":
{ Args: { "p_character": string,"p_ritual"?: boolean,"p_slot_level"?: number,"p_spell": string }; Returns: {
              "campaign_id": string,
"character_id": string,
"concentration": Json | null,
"prepare_open": boolean,
"slots_used": (number)[],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "character_spell_state"
        isOneToOne: true
        isSetofReturn: false
      } },
"character_campaign":
{ Args: { "c": string }; Returns: string
                           },
"check_source":
{ Args: { "p_source": string }; Returns: undefined
                           },
"class_slots":
{ Args: { "p_class": string,"p_level": number }; Returns: (number)[]
                           },
"coins_of":
{ Args: { "p_coins": Json }; Returns: {
              "cp": number,"gp": number,"pp": number,"sp": number
            }[]
                           },
"create_character_from_wizard":
{ Args: { "p_actor": string,"p_campaign": string,"p_gp": number,"p_items": Json,"p_name": string,"p_roll"?: string,"p_sheet": Json }; Returns: string
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
"create_item":
{ Args: { "p_bound"?: boolean,"p_campaign": string,"p_definition": Json,"p_kind": string,"p_name": string,"p_owner_id": string,"p_owner_type": string,"p_quantity"?: number,"p_rarity"?: string,"p_requires_attunement"?: boolean,"p_srd_ref"?: string,"p_value_cp"?: number,"p_weight"?: number }; Returns: {
              "attuned": boolean,
"bound": boolean,
"campaign_id": string,
"created_at": string,
"definition": NonNullable<Json>,
"entity_id": string,
"equipped": boolean,
"kind": string,
"owner_id": string | null,
"owner_type": string,
"quantity": number,
"rarity": string | null,
"requires_attunement": boolean,
"srd_ref": string | null,
"value_cp": number,
"weight": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_official_party":
{ Args: { "c": string }; Returns: string
                           },
"d20":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"decline_transfer":
{ Args: { "p_transfer": string }; Returns: undefined
                           },
"delete_entity":
{ Args: { "p_entity": string }; Returns: undefined
                           },
"delete_folder":
{ Args: { "p_folder": string }; Returns: undefined
                           },
"deposit_to_party":
{ Args: { "p_character": string,"p_coins": Json,"p_note"?: string }; Returns: undefined
                           },
"details_from_sheet":
{ Args: { "s": Json }; Returns: Json
                           },
"details_ok":
{ Args: { "d": Json }; Returns: boolean
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
"equip_item":
{ Args: { "p_item": string }; Returns: {
              "attuned": boolean,
"bound": boolean,
"campaign_id": string,
"created_at": string,
"definition": NonNullable<Json>,
"entity_id": string,
"equipped": boolean,
"kind": string,
"owner_id": string | null,
"owner_type": string,
"quantity": number,
"rarity": string | null,
"requires_attunement": boolean,
"srd_ref": string | null,
"value_cp": number,
"weight": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } },
"folder_campaign":
{ Args: { "object_name": string }; Returns: string
                           },
"force_move_item":
{ Args: { "p_item": string,"p_quantity"?: number,"p_to_id": string,"p_to_type": string }; Returns: string
                           },
"free_entity_name":
{ Args: { "base": string,"c": string }; Returns: string
                           },
"is_dm":
{ Args: { "c": string }; Returns: boolean
                           },
"is_member":
{ Args: { "c": string }; Returns: boolean
                           },
"is_shield":
{ Args: { "d": Json }; Returns: boolean
                           },
"item_campaign":
{ Args: { "i": string }; Returns: string
                           },
"join_campaign":
{ Args: { "code": string }; Returns: string
                           },
"ledger_note":
{ Args: { "fallback": string }; Returns: string
                           },
"ledger_reason":
{ Args: { "p_note": string,"p_source": string }; Returns: undefined
                           },
"ledger_source":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"level_from_xp":
{ Args: { "xp": number }; Returns: number
                           },
"map_campaign":
{ Args: { "m": string }; Returns: string
                           },
"map_is_revealed":
{ Args: { "m": string }; Returns: boolean
                           },
"max_spell_level":
{ Args: { "p_class": string,"p_level": number }; Returns: number
                           },
"move_coins":
{ Args: { "p_cp": number,"p_gp": number,"p_note": string,"p_owner_id": string,"p_owner_type": string,"p_pp": number,"p_sign": number,"p_source": string,"p_sp": number }; Returns: undefined
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
"move_item":
{ Args: { "p_item": string,"p_quantity": number,"p_to_id": string,"p_to_type": string }; Returns: string
                           },
"offer_transfer":
{ Args: { "p_item": string,"p_quantity"?: number,"p_to_character": string }; Returns: {
              "campaign_id": string,
"created_at": string,
"created_by": string | null,
"from_id": string | null,
"from_name": string,
"from_type": string,
"id": string,
"item_id": string | null,
"item_name": string,
"quantity": number,
"resolved_at": string | null,
"seq": number,
"status": string,
"to_id": string | null,
"to_name": string,
"to_type": string
            }
                          SetofOptions: {
        from: "*"
        to: "item_transfers"
        isOneToOne: true
        isSetofReturn: false
      } },
"official_party":
{ Args: { "c": string }; Returns: string
                           },
"owner_campaign":
{ Args: { "p_id": string,"p_type": string }; Returns: string
                           },
"owner_name":
{ Args: { "p_id": string,"p_type": string }; Returns: string
                           },
"owns_character":
{ Args: { "c": string }; Returns: boolean
                           },
"party_campaign":
{ Args: { "p": string }; Returns: string
                           },
"party_roster":
{ Args: { "p_campaign": string }; Returns: {
              "ability_scores": Json,"character_id": string,"effects": Json,"name": string
            }[]
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
"require_owner_or_dm":
{ Args: { "p_character": string }; Returns: undefined
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
"roll_ability_scores":
{ Args: { "p_campaign": string }; Returns: {
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
"roll_die":
{ Args: { "sides": number }; Returns: number
                           },
"roll_hit_die":
{ Args: { "p_character": string }; Returns: {
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
"roll_pool":
{ Args: { "count": number,"sides": number }; Returns: (number)[]
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
"set_item_worn":
{ Args: { "p_field": string,"p_item": string,"p_value": boolean }; Returns: {
              "attuned": boolean,
"bound": boolean,
"campaign_id": string,
"created_at": string,
"definition": NonNullable<Json>,
"entity_id": string,
"equipped": boolean,
"kind": string,
"owner_id": string | null,
"owner_type": string,
"quantity": number,
"rarity": string | null,
"requires_attunement": boolean,
"srd_ref": string | null,
"value_cp": number,
"weight": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_prepared_spells":
{ Args: { "p_character": string,"p_prepared": (string)[] }; Returns: Json
                           },
"shares_campaign":
{ Args: { "other": string }; Returns: boolean
                           },
"simple_long_rest":
{ Args: { "p_character": string }; Returns: {
              "campaign_id": string,
"character_id": string,
"created_at": string,
"created_by": string | null,
"details": NonNullable<Json>,
"id": string,
"kind": string
            }
                          SetofOptions: {
        from: "*"
        to: "rest_events"
        isOneToOne: true
        isSetofReturn: false
      } },
"simple_long_rest_party":
{ Args: { "p_campaign": string }; Returns: number
                           },
"spell_state_for":
{ Args: { "p_character": string }; Returns: {
              "campaign_id": string,
"character_id": string,
"concentration": Json | null,
"prepare_open": boolean,
"slots_used": (number)[],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "character_spell_state"
        isOneToOne: true
        isSetofReturn: false
      } },
"split_party_gold":
{ Args: { "p_party": string }; Returns: undefined
                           },
"target_campaign":
{ Args: { "p_target_id": string,"p_target_type": string }; Returns: string
                           },
"unattune_item":
{ Args: { "p_item": string }; Returns: {
              "attuned": boolean,
"bound": boolean,
"campaign_id": string,
"created_at": string,
"definition": NonNullable<Json>,
"entity_id": string,
"equipped": boolean,
"kind": string,
"owner_id": string | null,
"owner_type": string,
"quantity": number,
"rarity": string | null,
"requires_attunement": boolean,
"srd_ref": string | null,
"value_cp": number,
"weight": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } },
"unequip_item":
{ Args: { "p_item": string }; Returns: {
              "attuned": boolean,
"bound": boolean,
"campaign_id": string,
"created_at": string,
"definition": NonNullable<Json>,
"entity_id": string,
"equipped": boolean,
"kind": string,
"owner_id": string | null,
"owner_type": string,
"quantity": number,
"rarity": string | null,
"requires_attunement": boolean,
"srd_ref": string | null,
"value_cp": number,
"weight": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } },
"unused_ability_roll":
{ Args: { "p_campaign": string,"p_user": string }; Returns: {
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
"unused_hit_die_roll":
{ Args: { "p_character": string,"p_level": number }; Returns: {
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
"withdraw_from_party":
{ Args: { "p_character": string,"p_coins": Json,"p_note"?: string }; Returns: undefined
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
