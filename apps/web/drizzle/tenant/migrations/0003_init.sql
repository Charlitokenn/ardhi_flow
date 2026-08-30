ALTER TABLE "contract_events" ADD COLUMN "installment_id" uuid;--> statement-breakpoint
ALTER TABLE "contract_events" ADD COLUMN "is_internal" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_installment_id_contract_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."contract_installments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_events_installment_idx" ON "contract_events" USING btree ("installment_id");--> statement-breakpoint
CREATE INDEX "contract_events_type_idx" ON "contract_events" USING btree ("event_type");