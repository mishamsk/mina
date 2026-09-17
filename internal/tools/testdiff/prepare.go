package main

import (
	"cmp"
	"slices"
)

func prepare(data gathered) report {
	goTests := compare("go", data.Before.Go, data.After.Go, nil)
	frontend := compare("frontend_e2e", data.Before.Frontend, data.After.Frontend, func(before, after test) bool {
		for _, h := range data.Diffs[before.File] {
			if overlaps(before, h.Before) || overlaps(after, h.After) {
				return true
			}
		}
		return false
	})
	frontend.Estimated = true
	before, after := make(map[string]test), make(map[string]test)
	for file := range data.Before.Scripts {
		before[file] = test{Name: file, File: file}
	}
	for file := range data.After.Scripts {
		after[file] = test{Name: file, File: file}
	}
	scripts := compare("cli_scripts", before, after, func(before, after test) bool {
		return data.Before.Scripts[before.File].Hash != data.After.Scripts[after.File].Hash
	})
	scripts.Lines = &lineCount{}
	for _, c := range scripts.Changes {
		switch c.Status {
		case "added":
			scripts.Lines.Added += data.After.Scripts[c.After.File].Lines
		case "removed":
			scripts.Lines.Deleted += data.Before.Scripts[c.Before.File].Lines
		case "modified":
			for _, h := range data.Diffs[c.After.File] {
				scripts.Lines.Added += h.After.Count
				scripts.Lines.Deleted += h.Before.Count
			}
		}
	}
	mode := "main-tip-to-head"
	if data.Working {
		mode = "main-tip-to-worktree"
	}
	return report{SchemaVersion: 1, Mode: mode, Base: data.Base, Current: data.Current, Categories: []category{goTests, frontend, scripts}}
}

func compare(kind string, before, after map[string]test, modified func(test, test) bool) category {
	c := category{Kind: kind, Before: len(before), After: len(after), Changes: []change{}}
	if modified != nil {
		c.Modified = new(int)
	}
	for key, old := range before {
		next, exists := after[key]
		if !exists {
			c.Removed++
			c.Changes = append(c.Changes, change{Status: "removed", Before: &old})
		} else if modified != nil && modified(old, next) {
			*c.Modified++
			c.Changes = append(c.Changes, change{Status: "modified", Before: &old, After: &next})
		}
	}
	for key, next := range after {
		if _, exists := before[key]; !exists {
			c.Added++
			c.Changes = append(c.Changes, change{Status: "added", After: &next})
		}
	}
	slices.SortFunc(c.Changes, func(a, b change) int {
		x, y := changedTest(a), changedTest(b)
		if result := cmp.Compare(x.File, y.File); result != 0 {
			return result
		}
		if result := cmp.Compare(x.Name, y.Name); result != 0 {
			return result
		}
		return cmp.Compare(a.Status, b.Status)
	})
	return c
}

func overlaps(t test, s span) bool {
	return s.Count > 0 && s.Start <= t.End && s.Start+s.Count-1 >= t.Line
}

func changedTest(c change) test {
	if c.After != nil {
		return *c.After
	}
	return *c.Before
}
