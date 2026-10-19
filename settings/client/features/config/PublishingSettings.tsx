import { SCENE_TEMPLATE_OPTIONS } from "../../../../packages/studio/src/remotion/capabilities/scene-templates/catalog";
import { Field, FieldRow, Section } from "../../components/Form";
import type { EditorProps } from "./types";

export const SceneDefaults = ({ config, update }: EditorProps) => (
  <Section
    eyebrow="03 / SCENE TEMPLATES"
    title="新作品片头片尾"
    description="film:new 把这里的选择写入新作品的 film.json；已经创建的作品不跟随这里的变化。"
  >
    <FieldRow>
      <Field label="片头" hint="留空表示新作品不加片头">
        <select
          value={config.sceneDefaults.introSceneTemplateId ?? ""}
          onChange={(event) =>
            update((draft) => {
              draft.sceneDefaults.introSceneTemplateId =
                event.target.value === "" ? null : event.target.value;
            })
          }
        >
          <option value="">不使用</option>
          {SCENE_TEMPLATE_OPTIONS.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="片尾" hint="留空表示新作品不加片尾">
        <select
          value={config.sceneDefaults.outroSceneTemplateId ?? ""}
          onChange={(event) =>
            update((draft) => {
              draft.sceneDefaults.outroSceneTemplateId =
                event.target.value === "" ? null : event.target.value;
            })
          }
        >
          <option value="">不使用</option>
          {SCENE_TEMPLATE_OPTIONS.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </Field>
    </FieldRow>
  </Section>
);
