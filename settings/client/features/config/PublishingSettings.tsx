import { SCENE_TEMPLATE_OPTIONS } from "../../../../packages/studio/src/remotion/capabilities/scene-templates/catalog";
import { Field, FieldRow, Section } from "../../components/Form";
import { nextUniqueId } from "../../model";
import type { EditorProps } from "./types";

export const SceneDefaults = ({ config, update }: EditorProps) => (
  <Section
    eyebrow="03 / SCENE TEMPLATES"
    title="新作品默认 Scene"
    description="创建新 Project 时复制所选 Scene 的源码与资源；已经创建的 Project 不再引用或跟随这里的模板。"
  >
    <FieldRow>
      <Field label="片头 Scene" hint="留空表示新作品不添加片头 Scene">
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
      <Field label="片尾 Scene" hint="留空表示新作品不添加片尾 Scene">
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
    <div className="spec-strip">
      <span>实例化策略</span>
      <strong>复制到 Project-local</strong>
      <strong>现有 Project 不跟随模板变化</strong>
    </div>
  </Section>
);
export const Collections = ({ config, update }: EditorProps) => {
  const addCollection = () =>
    update((draft) => {
      draft.publishingCollections = [
        ...draft.publishingCollections,
        {
          id: nextUniqueId(
            "collection",
            draft.publishingCollections.map(({ id }) => id),
          ),
          name: "新合集",
          description: "说明这个合集最适合什么主题。",
        },
      ];
    });
  return (
    <Section
      eyebrow="03 / PUBLISHING"
      title="发布合集"
      description="Agent 必须根据描述，从此数组中选择且只选择一个最合适的合集。"
    >
      <div className="collection-list">
        {config.publishingCollections.map((collection, index) => (
          <div className="collection-row" key={`${collection.id}-${index}`}>
            <span className="row-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <Field label="ID">
              <input
                value={collection.id}
                onChange={(event) =>
                  update((draft) => {
                    draft.publishingCollections[index] = {
                      ...draft.publishingCollections[index]!,
                      id: event.target.value,
                    };
                  })
                }
              />
            </Field>
            <Field label="名称">
              <input
                value={collection.name}
                onChange={(event) =>
                  update((draft) => {
                    draft.publishingCollections[index] = {
                      ...draft.publishingCollections[index]!,
                      name: event.target.value,
                    };
                  })
                }
              />
            </Field>
            <Field label="适用描述">
              <textarea
                value={collection.description}
                onChange={(event) =>
                  update((draft) => {
                    draft.publishingCollections[index] = {
                      ...draft.publishingCollections[index]!,
                      description: event.target.value,
                    };
                  })
                }
              />
            </Field>
            <button
              className="icon-button"
              aria-label={`删除 ${collection.name}`}
              disabled={config.publishingCollections.length === 1}
              onClick={() =>
                update((draft) => {
                  draft.publishingCollections =
                    draft.publishingCollections.filter(
                      (_, itemIndex) => itemIndex !== index,
                    );
                })
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button className="secondary-button" onClick={addCollection}>
        ＋ 添加合集
      </button>
    </Section>
  );
};
