// Subject-scope authorization shared by the question bank, rubrics and
// generation jobs. ADMINs (and internal callers that pass no user) are
// unrestricted; a LECTURER may only touch resources whose subject they are
// assigned to. A resource with no subject (legacy rows) is unscoped.

function forbidden() {
  const err = new Error('You do not have access to this subject.');
  err.statusCode = 403;
  err.code = 'FORBIDDEN';
  return err;
}

class SubjectScope {
  constructor({ subjectRepository } = {}) {
    this.subjectRepository = subjectRepository;
  }

  // Returns { allows(subjectId), assert(subjectId) }. The lecturer's subject ids
  // are fetched lazily and at most once, so resources without a subject never
  // touch the repository.
  forUser(user) {
    const unrestricted = !user || user.role === 'ADMIN' || !this.subjectRepository;
    let allowedPromise = null;
    const allowed = () => {
      if (!allowedPromise) {
        allowedPromise = this.subjectRepository
          .listSubjectIdsForLecturer(user.id)
          .then((ids) => new Set(ids.map(Number)));
      }
      return allowedPromise;
    };
    const allows = async (subjectId) => {
      if (unrestricted || subjectId == null) return true;
      return (await allowed()).has(Number(subjectId));
    };
    return {
      allows,
      async assert(subjectId) {
        if (!(await allows(subjectId))) throw forbidden();
      },
    };
  }
}

module.exports = { SubjectScope };
