import { clone, wait } from '../../../services/mockClient';
import { store } from '../../../data/mockStore';

export async function listCourses() {
  await wait();
  return clone(store.courses);
}

export async function listTopics(courseId) {
  await wait();
  const topics = courseId
    ? store.topics.filter((topic) => topic.courseId === courseId)
    : store.topics;
  return clone(topics);
}

export async function listMaterials(topicId) {
  await wait();
  const materials = topicId
    ? store.materials.filter((material) => material.topicId === topicId)
    : store.materials;
  return clone(materials);
}
